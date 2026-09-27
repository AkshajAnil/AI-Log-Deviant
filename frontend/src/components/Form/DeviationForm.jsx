import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import {
  Save,
  RotateCcw,
  Shield,
  TriangleAlert,
  CircleCheckBig,
  ChevronDown,
  Search,
  CalendarDays,
} from 'lucide-react';
import {
  updateFormField,
  resetForm,
  syncParamNarrative,
  IMPACT_OPTIONS,
  SEVERITY_OPTIONS,
  SITE_OPTIONS,
  SOURCE_OPTIONS,
  PARAM_SYNC_KEYS,
} from '../../store/deviationSlice';

const DATE_RE = /^\d{2}-\d{2}-\d{4}$/;

const FIELDS = [
  { key: 'site_plant', label: 'Site / Plant', required: true, type: 'select', options: SITE_OPTIONS, placeholder: 'Select site' },
  { key: 'date_of_occurrence', label: 'Date of Occurrence', required: true, placeholder: 'dd-mm-yyyy', icon: CalendarDays },
  { key: 'title_short_description', label: 'Title / Short Description', required: true, placeholder: 'e.g. OOS result for Assay in Batch ABC-001' },
  { key: 'source', label: 'Source', required: true, type: 'select', options: SOURCE_OPTIONS, placeholder: 'Select source' },
  { key: 'related_product_material', label: 'Related Product / Material', placeholder: 'Search product or material...', icon: Search },
  { key: 'batch_lot_number', label: 'Batch/Lot Number', placeholder: 'Enter batch / lot no.' },
];

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition';

function Field({ field, value, onChange, onBlur, invalid }) {
  if (field.type === 'select') {
    return (
      <div>
        <label
          className="block text-xs font-semibold text-slate-600 mb-1.5"
          htmlFor={field.key}
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="relative">
          <select
            id={field.key}
            value={value}
            onChange={(e) => onChange(field.key, e.target.value)}
            className={`${inputCls} appearance-none pr-10 ${value ? 'text-slate-800' : 'text-slate-400'} ${
              invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`
          }>
            <option value="">{field.placeholder}</option>
            {field.options.includes(value) ? null : value ? (
              <option key={value} value={value}>
                {value}
              </option>
            ) : null}
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          />
        </div>
      </div>
    );
  }

  const Icon = field.icon;
  return (
    <div>
      <label
        className="block text-xs font-semibold text-slate-600 mb-1.5"
        htmlFor={field.key}
      >
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          id={field.key}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          onBlur={onBlur}
          placeholder={field.placeholder}
          className={`
            ${inputCls}
            ${field.maxLength !== undefined ? `maxLength=${field.maxLength}` : ''}
            ${Icon ? 'pr-9' : ''}
            ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}
          `}
        />
        {Icon && (
          <Icon
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          />
        )}
      </div>
    </div>
  );
}

function SelectField({ id, label, required, value, onChange, options, placeholder, invalid, aiFilled }) {
  return (
    <div>
      <label
        className="block text-xs font-semibold text-slate-600 mb-1.5"
        htmlFor={id}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {aiFilled && (
          <span className="ml-2 align-middle rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
            AI
          </span>
        )}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} appearance-none pr-10 ${value ? 'text-slate-800' : 'text-slate-400'} ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
        />
      </div>
    </div>
  );
}

export default function DeviationForm() {
  const dispatch = useDispatch();
  const formData = useSelector((state) => state.deviation.formData);
  const aiRecommendation = useSelector((state) => state.deviation.aiRecommendation);
  const isExtracting = useSelector((state) => state.deviation.isExtracting);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState(null);

  const onChange = (field, value) => dispatch(updateFormField({ field, value }));

  // Attach param blur sync for fields that live in PARAM_SYNC_KEYS
  const onBlur = (field) => {
    if (PARAM_SYNC_KEYS.includes(field)) {
      dispatch(syncParamNarrative());
    }
  };

  const handleSave = async () => {
    const missing = [
      ...FIELDS.filter((f) => f.required && !String(formData[f.key] || '').trim()).map(
        (f) => f.label
      ),
    ];

    // Date format guard
    if (formData.date_of_occurrence && !DATE_RE.test(formData.date_of_occurrence)) {
      missing.push('Date of Occurrence (must be dd-mm-yyyy)');
    }

    if (!formData.initial_impact) missing.push('Initial Impact');
    if (!formData.initial_severity) missing.push('Initial Severity');

    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}`);
      return;
    }

    setError('');
    setSavedId(null);
    setSaving(true);
    try {
      const { data } = await axios.post('/api/deviations', formData);
      setSavedId(data.id);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : `Save failed: ${err.response?.status || err.message}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    dispatch(resetForm());
    setError('');
    setSavedId(null);
  };

  return (
    <section className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm mr-6">
      <header
        className="px-6 py-4 border-b border-slate-200 flex items-start justify-between"
      >
        <div>
          <h2 className="text-xl font-bold text-slate-900">Log Deviation</h2>
          <p
            className="mt-1 text-[13px] text-slate-500 uppercase tracking-wide"
          >
            Record any unexpected event, out-of-specification result or non-conformance.
          </p>
        </div>
        <span
          className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600"
        >
          Draft
        </span>
      </header>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={formData[field.key]}
              onChange={onChange}
              onBlur={() => onBlur(field.key)}
              invalid={Boolean(error) && field.required && !formData[field.key].trim()}
            />
          ))}
        </div>

        <div>
          <label
            className="block text-xs font-semibold text-slate-600 mb-1.5"
            htmlFor="detailed_description"
          >
            Detailed Description
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <textarea
            id="detailed_description"
            rows={6}
            value={formData.detailed_description}
            onChange={(e) => onChange('detailed_description', e.target.value)}
            placeholder="Describe what happened, where, when and how it was detected..."
            className={`w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y ${Boolean(
              error && !formData.detailed_description.trim()
            ) && 'border-red-400 focus:border-red-500 focus:ring-red-100'}`}
            maxLength={2000}
          />
          <span
            className="block text-[11px] text-slate-400 mt-1.5"
          >
            {formData.detailed_description?.length || 0}/2000
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SelectField
            id="initial_impact"
            label="Initial Impact"
            required
            value={formData.initial_impact}
            onChange={(value) => onChange('initial_impact', value)}
            options={IMPACT_OPTIONS}
            placeholder="Select impact"
            invalid={Boolean(error) && !formData.initial_impact}
            aiFilled={Boolean(aiRecommendation?.impact)}
          />
          <SelectField
            id="initial_severity"
            label="Initial Severity"
            required
            value={formData.initial_severity}
            onChange={(value) => onChange('initial_severity', value)}
            options={SEVERITY_OPTIONS}
            placeholder="Select severity"
            invalid={Boolean(error) && !formData.initial_severity}
            aiFilled={Boolean(aiRecommendation?.severity)}
          />
        </div>

        <div
          className="rounded-2xl border border-indigo-100 bg-[#f4f3fb] p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-indigo-700">AI copilot risk assessment</h3>
            <span className="ml-auto text-[11px] text-indigo-400">
              {isExtracting ? 'Analyzing…' : 'Suggested — edit before save'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                className="block text-xs font-medium text-indigo-500 mb-1.5"
                htmlFor="suggested_severity"
              >
                Severity (Suggested)
              </label>
              <div className="relative">
                <select
                  id="suggested_severity"
                  value={formData.initial_severity}
                  onChange={(e) => onChange('initial_severity', e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 pr-10 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Awaiting AI</option>
                  {SEVERITY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                />
              </div>
            </div>
            <div>
              <label
                className="block text-xs font-medium text-indigo-500 mb-1.5"
                htmlFor="suggested_next_action"
              >
                Suggested Next Action
              </label>
              <input
                id="suggested_next_action"
                value={formData.suggested_next_action}
                onChange={(e) => onChange('suggested_next_action', e.target.value)}
                placeholder="AI will suggest the next QA action"
                className="w-full rounded-xl border-2 border-blue-400 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-blue-300"
              />
            </div>
          </div>

          <div>
            <label
              className="block text-xs font-medium text-indigo-500 mb-1.5"
              htmlFor="initial_risk_assessment"
            >
              Initial Risk Assessment
            </label>
            <textarea
              id="initial_risk_assessment"
              rows={3}
              value={formData.initial_risk_assessment}
              onChange={(e) => onChange('initial_risk_assessment', e.target.value)}
              placeholder="Short AI reason for impact and severity (product quality / patient safety)."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y"
            />
          </div>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {savedId !== null && (
          <div
            className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700"
          >
            <CircleCheckBig className="w-4 h-4" />
            <span>Saved! Your deviation has been stored safely.</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Form
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Deviation'}
          </button>
        </div>
      </div>
    </section>
  );
}