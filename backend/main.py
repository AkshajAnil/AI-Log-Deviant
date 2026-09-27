from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

import json
import models
import schemas
from database import engine, get_db, database_backend_name, ping_database
import agent

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Deviation Intake API")


@app.get("/api/health")
def health():
    try:
        ping_database()
        db_ok = True
        db_error = None
    except Exception as exc:
        db_ok = False
        db_error = str(exc)
    return {
        "status": "ok" if db_ok else "degraded",
        "frontend": "React + Redux",
        "backend": "Python + FastAPI",
        "ai": "LangGraph + Groq",
        "groq_model": agent.GROQ_MODEL_NAME,
        "database": database_backend_name(),
        "database_connected": db_ok,
        "database_error": db_error,
    }

# Setup CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For assessment, allow all. In production restrict it.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/extract", response_model=schemas.ExtractionResult)
async def extract_deviation(
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    context: Optional[str] = Form(None)
):
    if not text and not file:
        raise HTTPException(status_code=400, detail="Either text or file must be provided")

    content_to_process = ""
    
    if file:
        if file.filename.endswith(".pdf"):
            import PyPDF2
            try:
                pdf_reader = PyPDF2.PdfReader(file.file)
                for page in pdf_reader.pages:
                    content_to_process += page.extract_text() + "\n"
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error reading PDF: {e}")
        else:
            # Assuming text-like file
            content_to_process = (await file.read()).decode("utf-8")
    
    if text:
        content_to_process += "\n" + text

    if not content_to_process.strip():
        raise HTTPException(status_code=400, detail="No extractable text found")

    # The form's current values let the analysis node rate the deviation on the
    # complete record instead of just the fragment that was pasted this time.
    form_context = None
    if context:
        try:
            parsed = json.loads(context)
            form_context = parsed if isinstance(parsed, dict) else None
        except (json.JSONDecodeError, TypeError):
            form_context = None

    try:
        return agent.process_deviation_text(content_to_process, context=form_context)
    except agent.AIUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

@app.post("/api/deviations", response_model=schemas.Deviation)
def create_deviation(deviation: schemas.DeviationCreate, db: Session = Depends(get_db)):
    db_deviation = models.Deviation(**deviation.model_dump())
    db.add(db_deviation)
    db.commit()
    db.refresh(db_deviation)
    return db_deviation

@app.get("/api/deviations", response_model=list[schemas.Deviation])
def read_deviations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    deviations = db.query(models.Deviation).offset(skip).limit(limit).all()
    return deviations

class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None

class ChatResponse(BaseModel):
    reply: str

@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    try:
        llm = agent.get_llm()
        from langchain_core.messages import HumanMessage, SystemMessage

        context_block = ""
        if request.context:
            filled = {k: v for k, v in request.context.items() if v}
            if filled:
                context_block = (
                    "\n\nCurrent deviation record the user is working on:\n"
                    + "\n".join(f"- {k}: {v}" for k, v in filled.items())
                )

        messages = [
            SystemMessage(content=(
                "You are a pharmaceutical QA expert assistant specialized in deviation management. "
                "Answer questions concisely and helpfully based on the deviation context provided. "
                "Keep answers under 3 sentences unless a longer explanation is essential."
            )),
            HumanMessage(content=f"{request.message}{context_block}")
        ]
        response = llm.invoke(messages)
        return {"reply": response.content}
    except Exception as e:
        return {"reply": f"Sorry, I couldn't process your question. Error: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
