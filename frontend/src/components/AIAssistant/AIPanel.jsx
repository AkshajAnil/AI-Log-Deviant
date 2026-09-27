import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import {
  Bot,
  Send,
  User,
  Upload,
  FileText,
  Paperclip,
  TriangleAlert,
  LoaderCircle,
  X,
} from 'lucide-react';
import {
  setExtractionState,
  setExtractedData,
  FORM_KEYS,
  diffUpdatedFields,
} from '../../store/deviationSlice';

const WELCOME = {
  role: 'assistant',
  content:
    'Upload a deviation document (PDF/TXT) or paste an email/narrative. I analyse every input and fill or update the whole record — all form fields plus Initial Impact, Initial Severity and the risk assessment. Review and edit everything on the left before saving.',
};

export default function AIPanel() {
  const dispatch = useDispatch();
  const formData = useSelector((state) => state.deviation.formData);
  const isExtracting = useSelector((state) => state.deviation.isExtracting);
  const extractionProgress = useSelector((state) => state.deviation.extractionProgress);

  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState(null);

  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isExtracting]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const startProgress = () => {
    clearInterval(timerRef.current);
    dispatch(setExtractionState({ isExtracting: true, progress: 8 }));
    timerRef.current = setInterval(() => {
      const el = document.getElementById('dev-extraction-progress');
      if (!el) return;
      const current = Number(el.dataset.value) || 0;
      const next = current >= 90 ? 90 : current + Math.ceil(Math.random() * 9);
      dispatch(setExtractionState({ progress: next }));
    }, 350);
  };

  const stopProgress = () => {
    clearInterval(timerRef.current);
    dispatch(setExtractionState({ isExtracting: false, progress: 100 }));
    setTimeout(() => dispatch(setExtractionState({ progress: 0 })), 800);
  };

  const handleExtract = async ({ text, file }) => {
    setError('');
    setBusy(true);
    startProgress();

    setMessages((m) => [
      ...m,
      { role: 'user', content: file ? `Uploaded file: ${file.name}` : text },
    ]);

    try {
      const body = new FormData();
      if (file) body.append('file', file);
      if (text) body.append('text', text);
      // Current form values, so the AI rates risk on the whole record and not
      // just this fragment.
      body.append('context', JSON.stringify(formData));

      const { data } = await axios.post('/api/extract', body);

      stopProgress();
      dispatch(setExtractedData(data));

      // formData here is the pre-dispatch value, i.e. what was on the form
      // before this request — so we can tell a first paste from an update.
      const hadDataBefore = FORM_KEYS.some(
        (key) => String(formData[key] || '').trim() !== ''
      );
      // The AI returns the complete record, so report only what actually moved.
      const changedFields = diffUpdatedFields(formData, data);
      const gotAnyData = FORM_KEYS.some(
        (key) => data[key] !== null && data[key] !== undefined && String(data[key]).trim() !== ''
      );
      const impact = data.initial_impact || 'pending review';
      const severity = data.initial_severity || 'pending review';
      const reason = data.initial_risk_assessment || data.impact_reason || '';
      const riskLines = [
        `Recommended Initial Impact: ${impact}. Initial Severity: ${severity}.`,
        reason ? `Reason: ${reason}` : '',
      ].filter(Boolean);

      if (changedFields.length > 0) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: [
              `${hadDataBefore ? 'Updated' : 'Extracted'} ${changedFields.length} field${
                changedFields.length === 1 ? '' : 's'
              }: ${changedFields.map((f) => f.replace(/_/g, ' ')).join(', ')}.`,
              ...riskLines,
              'Please review and edit the form (including the AI copilot risk assessment) before saving.',
            ].join('\n'),
          },
        ]);
      } else if (gotAnyData) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: [
              'No changes needed — the record already reflects this input.',
              ...riskLines,
            ].join('\n'),
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: hadDataBefore
              ? "I couldn't detect any field to update in that message. Tell me which field to change and its new value — e.g. \"batch is ABC-002\" or \"date of occurrence is 28-10-2026\". Everything else on the form stays exactly as it is."
              : 'I could not read any deviation details from that input. Please paste the narrative as plain text, or check that the PDF contains selectable text rather than a scanned image.',
          },
        ]);
      }
    } catch (err) {
      stopProgress();
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Extraction failed: ${
            err.response?.data?.detail || err.response?.status || err.message
          }`,
        },
      ]);
    } finally {
      setBusy(false);
      setInput('');
      setPendingFile(null);
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    handleExtract({ text: trimmed, file: null });
  };

  const handleChat = async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    setError('');
    setBusy(true);

    try {
      const { data } = await axios.post('/api/chat', {
        message: trimmed,
        context: formData,
      });
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err.response?.data?.detail || 'Chat request failed.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (accepted) => {
    const file = accepted[0];
    if (!file) return;
    setPendingFile(file);
    handleExtract({ text: null, file });
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'message/rfc822': ['.eml'],
    },
    maxFiles: 1,
    disabled: busy,
  });

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (pendingFile) {
        handleExtract({ text: input.trim() || null, file: pendingFile });
      } else {
        handleSend();
      }
    }
  };

  return (
    <aside className="w-full lg:w-[420px] shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm lg:sticky lg:top-24 max-h-[calc(100vh-7rem)]">
      <header className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <Bot className="w-5 h-5 text-blue-600" />
        <h2 className="font-bold text-gray-900">AI Assistant</h2>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
          <span
            className={`w-2 h-2 rounded-full ${
              isExtracting ? 'bg-amber-400 animate-pulse' : 'bg-green-500'
            }`}
          />
          {isExtracting ? 'Extracting' : 'Ready'}
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <p className="text-xs text-gray-400 text-center">
          Drop deviation files below or paste text/email here.
        </p>

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                m.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-600 text-white'
              }`}
            >
              {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-200'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isExtracting && (
          <div className="pl-9 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              Running extraction and risk analysis…
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
              <div
                id="dev-extraction-progress"
                data-value={extractionProgress}
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${extractionProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 p-4 space-y-3">
        <div
          {...getRootProps()}
          onClick={open}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-4 text-center transition ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          <Upload className="w-5 h-5 mx-auto text-gray-400 mb-1" />
          <p className="text-sm font-medium text-gray-700">Drop a document here</p>
          <p className="text-xs text-gray-500 mt-0.5">PDF, TXT or email (.eml) — or click to browse</p>
        </div>

        {pendingFile && (
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="truncate flex-1">{pendingFile.name}</span>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Remove file"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={open}
            disabled={busy}
            aria-label="Attach a document"
            title="Attach a document"
            className="w-9 h-10 shrink-0 rounded-md border border-gray-300 text-gray-500 flex items-center justify-center hover:bg-gray-50 hover:text-blue-600 disabled:opacity-40 transition"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Type a message or paste a deviation / email…"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="w-10 h-10 shrink-0 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleChat}
          disabled={busy || !input.trim()}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Ask AI about this deviation
        </button>
      </div>
    </aside>
  );
}
