import { createSlice } from '@reduxjs/toolkit';

export const IMPACT_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
export const SEVERITY_OPTIONS = ['Minor', 'Major', 'Critical'];

export const SITE_OPTIONS = [
  'API Manufacturing Unit',
  'Formulation Unit',
  'Packaging Unit',
  'Warehouse',
  'Quality Control Laboratory',
];

export const SOURCE_OPTIONS = [
  'Manufacturing',
  'Quality Control',
  'Warehouse',
  'Engineering',
  'Vendor',
  'Human Error',
];

export const FORM_KEYS = [
  'site_plant',
  'date_of_occurrence',
  'title_short_description',
  'source',
  'related_product_material',
  'batch_lot_number',
  'detailed_description',
  'initial_impact',
  'initial_severity',
  'suggested_next_action',
  'initial_risk_assessment',
];

// Parameters that commonly appear inside the narrative. When one of these is
// corrected, the title/description must follow, otherwise the form shows a new
// value next to a narrative that still names the old one.
export const PARAM_SYNC_KEYS = [
  'site_plant',
  'date_of_occurrence',
  'source',
  'related_product_material',
  'batch_lot_number',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const mod100 = n % 100;
  return suffix[(mod100 - 20) % 10] || suffix[mod100] || suffix[0];
}

// The narrative rarely echoes the stored value verbatim: the form holds
// "26-09-2026" while the text says "26 Sept 2026". Enumerate the forms a
// date could take so a corrected date actually reaches the prose.
function narrativeVariants(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (!match) return [raw];

  const [, d2, mo2, year] = match;
  const day = Number(d2);
  const month = Number(mo2);
  if (day < 1 || day > 31 || month < 1 || month > 12) return [raw];

  const d1 = String(day);
  const m1 = String(month);
  const names = [MONTHS_SHORT[month - 1], MONTHS[month - 1]];
  if (month === 9) names.push('Sept');

  const dayForms = [...new Set([d2, d1, `${d1}${ordinal(day)}`])];
  const monthForms = [...new Set([mo2, m1])];

  const out = new Set([raw]);
  dayForms.forEach((d) => {
    monthForms.forEach((m) => {
      out.add(`${d}-${m}-${year}`);
      out.add(`${d}/${m}/${year}`);
      out.add(`${d}.${m}.${year}`);
      out.add(`${year}-${m}-${d}`);
    });
    names.forEach((name) => {
      out.add(`${d} ${name} ${year}`);
      out.add(`${name} ${d}, ${year}`);
      out.add(`${name} ${d} ${year}`);
      out.add(`${d} of ${name} ${year}`);
      out.add(`${d} of ${name.toLowerCase()} ${year}`);
    });
  });
  return [...out];
}

function applyNarrativeSync(state, previous) {
  PARAM_SYNC_KEYS.forEach((key) => {
    const oldVal = previous[key] || '';
    const newVal = state.formData[key] || '';
    if (!oldVal || !newVal || oldVal === newVal || oldVal.length < 3) return;
    const variants = narrativeVariants(oldVal);
    ['title_short_description', 'detailed_description'].forEach((target) => {
      const text = state.formData[target];
      if (!text) return;
      let next = text;
      variants.forEach((variant) => {
        if (variant && next.includes(variant)) next = next.split(variant).join(newVal);
      });
      if (next !== text) state.formData[target] = next;
    });
  });
}

// Keep the last value that was actually written into the narrative. Cleared
// fields keep their previous snapshot so a later re-entry can still be matched
// against the text it replaced.
function refreshSnapshots(state) {
  PARAM_SYNC_KEYS.forEach((key) => {
    const value = state.formData[key] || '';
    if (value) state.paramSnapshots[key] = value;
  });
}

function snapshotPrevious(state) {
  const previous = {};
  PARAM_SYNC_KEYS.forEach((key) => {
    previous[key] = state.formData[key] || '';
  });
  return previous;
}

// Build the narrative from whatever the other fields already hold, so a form
// that has facts but no prose still ends up with a usable description.
function composeDescription(f) {
  const hasAny =
    PARAM_SYNC_KEYS.some((key) => f[key]) || Boolean(f.title_short_description);
  if (!hasAny) return '';

  const where = f.site_plant ? ` at ${f.site_plant}` : '';
  const src = f.source ? ` (source: ${f.source})` : '';
  const material = [
    f.related_product_material ? `product/material ${f.related_product_material}` : '',
    f.batch_lot_number ? `batch ${f.batch_lot_number}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const head =
    `${f.date_of_occurrence ? `On ${f.date_of_occurrence}` : 'On an unrecorded date'}` +
    `${where}${src}, a deviation was recorded` +
    `${material ? ` for ${material}` : ''}.`;

  return f.title_short_description ? `${head} ${f.title_short_description}.` : head;
}

// A short correction must never replace a real narrative: keep the richer text
// and let applyNarrativeSync fold the new values into it instead.
function isNarrativeClobber(existing, incoming) {
  return (
    Boolean(existing) &&
    incoming.length < 150 &&
    existing.length > incoming.length
  );
}

const emptyForm = {
  site_plant: '',
  date_of_occurrence: '',
  title_short_description: '',
  source: '',
  related_product_material: '',
  batch_lot_number: '',
  detailed_description: '',
  initial_impact: '',
  initial_severity: '',
  suggested_next_action: '',
  initial_risk_assessment: '',
};

const emptySnapshots = PARAM_SYNC_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: '' }),
  {}
);

const initialState = {
  formData: { ...emptyForm },
  paramSnapshots: { ...emptySnapshots },
  extractionProgress: 0,
  isExtracting: false,
  aiRecommendation: null,
};

function pickOption(value, options) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === lower);
  if (exact) return exact;
  const contained = options.find((o) => lower.includes(o.toLowerCase()));
  return contained || '';
}

// The AI now returns the whole record every time, so "which fields changed"
// must be a diff against what the form already held — not a count of whatever
// came back non-empty.
export function diffUpdatedFields(formData, data) {
  return FORM_KEYS.filter((key) => {
    const incoming = data ? data[key] : undefined;
    if (incoming === null || incoming === undefined) return false;
    let after = String(incoming).trim();
    if (!after) return false;
    if (key === 'initial_impact') after = pickOption(after, IMPACT_OPTIONS);
    else if (key === 'initial_severity') after = pickOption(after, SEVERITY_OPTIONS);
    return after !== String(formData[key] || '').trim();
  });
}

const deviationSlice = createSlice({
  name: 'deviation',
  initialState,
  reducers: {
    updateFormField: (state, action) => {
      const { field, value } = action.payload;
      state.formData[field] = value;
    },
    // Fired on blur, not on keystroke: syncing while the user is still typing
    // would rewrite the narrative one character at a time and corrupt it.
    syncParamNarrative: (state) => {
      const previous = {};
      PARAM_SYNC_KEYS.forEach((key) => {
        previous[key] = state.paramSnapshots[key] || '';
      });
      applyNarrativeSync(state, previous);
      refreshSnapshots(state);
      if (!state.formData.detailed_description) {
        state.formData.detailed_description = composeDescription(state.formData);
      }
    },
    resetForm: (state) => {
      state.formData = { ...emptyForm };
      state.paramSnapshots = { ...emptySnapshots };
      state.aiRecommendation = null;
      state.extractionProgress = 0;
    },
    setExtractionState: (state, action) => {
      const { isExtracting, progress } = action.payload;
      if (isExtracting !== undefined) state.isExtracting = isExtracting;
      if (progress !== undefined) state.extractionProgress = progress;
    },
    setExtractedData: (state, action) => {
      const data = action.payload || {};

      const previous = snapshotPrevious(state);

      FORM_KEYS.forEach((key) => {
        const value = data[key];
        const hasValue =
          value !== null && value !== undefined && String(value).trim() !== '';
        if (!hasValue) return;
        if (key === 'initial_impact') {
          state.formData.initial_impact = pickOption(value, IMPACT_OPTIONS);
        } else if (key === 'initial_severity') {
          state.formData.initial_severity = pickOption(value, SEVERITY_OPTIONS);
        } else if (
          key === 'detailed_description' &&
          isNarrativeClobber(state.formData.detailed_description, String(value).trim())
        ) {
          // Keep the existing narrative; the corrections are merged below.
          return;
        } else {
          state.formData[key] = String(value).trim();
        }
      });

      // Propagate corrected parameters into the narrative so nothing disagrees.
      applyNarrativeSync(state, previous);
      refreshSnapshots(state);

      // Facts but no prose: derive the description from the fields we have.
      if (!state.formData.detailed_description) {
        state.formData.detailed_description = composeDescription(state.formData);
      }

      // Only overwrite the AI-generated assessment when the response actually
      // carries one. An empty analysis must not wipe a previous recommendation.
      const newImpact = pickOption(data.initial_impact, IMPACT_OPTIONS);
      const newSeverity = pickOption(data.initial_severity, SEVERITY_OPTIONS);
      const shortReason = String(
        data.impact_reason || data.initial_risk_assessment || ''
      ).trim();
      const riskText = String(
        data.initial_risk_assessment || data.impact_reason || ''
      ).trim();
      const newAction = String(data.suggested_next_action || '').trim();
      const previousRecommendation = state.aiRecommendation || {};

      if (riskText) state.formData.initial_risk_assessment = riskText;
      if (newImpact) state.formData.initial_impact = newImpact;
      if (newSeverity) state.formData.initial_severity = newSeverity;
      if (newAction) state.formData.suggested_next_action = newAction;

      if (newImpact || newSeverity || shortReason || newAction) {
        state.aiRecommendation = {
          impact: newImpact || state.formData.initial_impact,
          severity: newSeverity || state.formData.initial_severity,
          reason: shortReason || previousRecommendation.reason || '',
          action: newAction || previousRecommendation.action || '',
        };
      }
    },
  },
});

export const {
  updateFormField,
  syncParamNarrative,
  resetForm,
  setExtractionState,
  setExtractedData,
} = deviationSlice.actions;

export default deviationSlice.reducer;
