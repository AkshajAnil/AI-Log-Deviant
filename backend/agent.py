import os
from datetime import date
from typing import TypedDict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

load_dotenv()

GROQ_MODEL_NAME = os.getenv("GROQ_MODEL", "gemma2-9b-it")

PLACEHOLDER_KEYS = {
    "",
    "your_groq_api_key_here",
    "your_key_here",
    "your_groq_api_key",
}


class AIUnavailableError(RuntimeError):
    """Raised when the LLM cannot be reached or is not configured."""


def _require_api_key() -> str:
    key = (os.getenv("GROQ_API_KEY") or "").strip()
    if key in PLACEHOLDER_KEYS:
        raise AIUnavailableError(
            "GROQ_API_KEY in backend/.env is still the placeholder value. "
            "Add a real key from https://console.groq.com/keys and restart the backend."
        )
    return key


class AgentState(TypedDict):
    text: str
    context: dict
    extracted_data: dict
    analysis: dict
    errors: list


# Define schema for LLM output extraction
class DeviationExtraction(BaseModel):
    site_plant: str = Field(description="Site or Plant name. E.g. API Manufacturing Unit", default="")
    date_of_occurrence: str = Field(description="Date of occurrence in dd-mm-yyyy format", default="")
    title_short_description: str = Field(description="Short title or description of the deviation", default="")
    source: str = Field(description="Source of the deviation", default="")
    related_product_material: str = Field(description="Related product or material name", default="")
    batch_lot_number: str = Field(description="Batch or lot number", default="")
    detailed_description: str = Field(description="Detailed description of the deviation", default="")


class DeviationAnalysis(BaseModel):
    initial_impact: str = Field(description="Initial impact level: Low, Medium, High, or Critical", default="")
    initial_severity: str = Field(description="Initial severity level: Minor, Major, or Critical", default="")
    impact_reason: str = Field(description="Short 1-2 sentence explanation of potential product quality or patient safety risk", default="")
    initial_risk_assessment: str = Field(description="Overall initial risk assessment statement for the deviation, 1-2 sentences, covering quality, patient safety and regulatory impact", default="")
    suggested_next_action: str = Field(description="Concise recommended QA action e.g. 'Route to QA Investigation & Issue Replacement', 'Initiate CAPA', 'Quarantine Batch for Review'", default="")


def get_llm():
    _require_api_key()
    return ChatGroq(model=GROQ_MODEL_NAME, temperature=0)


# Node 1: Extract structured fields from text
def extract_information(state: AgentState):
    errors = list(state.get("errors") or [])
    text = state["text"]
    form_context = state.get("context") or {}
    parser = JsonOutputParser(pydantic_object=DeviationExtraction)

    # Only this fragment is an f-string, so the {format_instructions} and {text}
    # prompt placeholders below are never touched by interpolation.
    year_hint = (
        f"If a date omits the year, use the current year ({date.today().year}) "
        "rather than leaving the field empty. "
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are an AI assistant for a pharmaceutical manufacturer. "
         "Produce the COMPLETE deviation record after applying the supplied input. "
         "For every field: carry forward the value already in the current record when the input "
         "does not change it, apply any correction the input makes, and leave a field empty only "
         "when neither the current record nor the input provides a value. Never return a partial "
         "record - the caller applies your answer as the whole form. "
         "You may receive a full report or a short update to an existing record. "
         "Examples: 'batch is ABC-002' -> batch_lot_number 'ABC-002'; "
         "'date of occurance is 28th of oct' -> date_of_occurrence '28-10-2026'. "
         "title_short_description: a concise, formal, standalone title for the deviation, e.g. "
         "'OOS Assay Result for Batch ABC-001'. Rephrase into a proper title - never copy the "
         "input verbatim. "
         "detailed_description: the narrative of what happened. Keep the existing narrative unless "
         "the input is itself a fuller report or note; never return the raw input verbatim. "
         "Write all dates as dd-mm-yyyy. " + year_hint +
         "{format_instructions}"),
        ("human", "{record}\n\nInput to process:\n{text}")
    ])

    # Ground the extractor in what is already on the form so it can tell a new
    # report from a passing correction, and title the deviation properly.
    record_lines, _, _ = build_analysis_context({}, form_context)
    record = (
        "Current record (do not restate unchanged fields):\n" + record_lines
        if record_lines
        else "Current record: empty — this is the first input for this deviation."
    )

    try:
        chain = prompt | get_llm() | parser
        extracted = chain.invoke({
            "text": text,
            "record": record,
            "format_instructions": parser.get_format_instructions()
        })
    except Exception as e:
        print(f"Extraction error: {e}")
        extracted = {}
        errors.append(f"Extraction failed: {e}")

    return {"extracted_data": extracted, "errors": errors}


# Fields the risk analysis reasons about, in the order they are presented.
CONTEXT_FIELDS = [
    ("site_plant", "Site/Plant"),
    ("date_of_occurrence", "Date of occurrence"),
    ("source", "Source"),
    ("related_product_material", "Related product/material"),
    ("batch_lot_number", "Batch/Lot number"),
    ("title_short_description", "Title"),
    ("detailed_description", "Description"),
]

# Enough on its own to judge risk; site/date/source alone are not.
RISK_BEARING = (
    "title_short_description",
    "detailed_description",
    "related_product_material",
    "batch_lot_number",
)


def build_analysis_context(form_context: dict, extracted: dict) -> tuple:
    """Merge what is already on the form with what this submission produced.

    New values win; unchanged values are carried forward, so a narrow follow-up
    is still rated against the whole record rather than the fragment alone.
    Returns (context_text, merged_values, labels_changed_now).
    """
    form_context = form_context or {}
    extracted = extracted or {}

    lines, merged, changed = [], {}, []
    for key, label in CONTEXT_FIELDS:
        old = str(form_context.get(key) or "").strip()
        new = str(extracted.get(key) or "").strip()
        value = new or old
        merged[key] = value
        if value:
            lines.append(f"{label}: {value}")
        if new and new != old:
            changed.append(label)

    if changed:
        lines.append("")
        lines.append(
            "Corrected or newly provided in this submission: " + ", ".join(changed)
        )
    return "\n".join(lines), merged, changed


# Node 2: Analyze and recommend impact, severity, next action, and risk assessment
def analyze_deviation(state: AgentState):
    errors = list(state.get("errors") or [])
    extracted_data = state.get("extracted_data") or {}
    form_context = state.get("context") or {}

    context, merged, changed = build_analysis_context(form_context, extracted_data)

    if not any(str(merged.get(key) or "").strip() for key in RISK_BEARING):
        # Nothing that carries risk has been stated yet (no title, narrative,
        # product or batch). Rating from nothing would overwrite a sound
        # assessment with a guess, so return nothing and let the UI keep values.
        print("Analysis skipped: no risk-relevant context.")
        return {"analysis": {}, "errors": errors}

    parser = JsonOutputParser(pydantic_object=DeviationAnalysis)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a pharmaceutical QA expert. Analyze the deviation and return JSON with these exact fields:\n"
                   "- initial_impact: one of Low, Medium, High, Critical\n"
                   "- initial_severity: one of Minor, Major, Critical\n"
                   "- impact_reason: 1-2 sentences on potential product quality or patient safety risk\n"
                   "- initial_risk_assessment: 1-2 sentence overall risk statement covering quality, patient safety and regulatory impact\n"
                   "- suggested_next_action: concise QA action (e.g. 'Route to QA Investigation & Issue Replacement', 'Initiate CAPA', 'Quarantine Batch for Review')\n\n"
                   "The context below is the complete current record. Weigh any field marked as "
                   "corrected in this submission most heavily, and reassess from scratch rather "
                   "than assuming any earlier rating still applies.\n\n"
                   "{format_instructions}"),
        ("human", "Deviation Context:\n{context}")
    ])

    try:
        chain = prompt | get_llm() | parser
        analysis = chain.invoke({
            "context": context,
            "format_instructions": parser.get_format_instructions()
        })
    except Exception as e:
        print(f"Analysis error: {e}")
        analysis = {
            "initial_impact": "",
            "initial_severity": "",
            "impact_reason": "",
            "initial_risk_assessment": "",
            "suggested_next_action": ""
        }
        errors.append(f"Analysis failed: {e}")

    return {"analysis": analysis, "errors": errors}


# Build LangGraph workflow
workflow = StateGraph(AgentState)
workflow.add_node("extract", extract_information)
workflow.add_node("analyze", analyze_deviation)
workflow.set_entry_point("extract")
workflow.add_edge("extract", "analyze")
workflow.add_edge("analyze", END)

app_agent = workflow.compile()


def process_deviation_text(text: str, context: dict = None) -> dict:
    _require_api_key()

    initial_state = {
        "text": text,
        "context": context or {},
        "extracted_data": {},
        "analysis": {},
        "errors": [],
    }
    result = app_agent.invoke(initial_state)

    errors = result.get("errors") or []
    extracted = result.get("extracted_data") or {}
    got_data = any(str(v or "").strip() for v in extracted.values())

    if errors and not got_data:
        raise AIUnavailableError(" | ".join(errors))

    final_result = {**extracted, **(result.get("analysis") or {})}
    return final_result
