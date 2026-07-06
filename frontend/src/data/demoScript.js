// Scripted narrative for the AI Healing Demo. Kept as pure data so the demo
// engine (useDemoRunner) and presentation components stay generic and this
// file is the only place to touch when tuning the story for a live demo.

export const SUITES = [
  { key: 'login', label: 'Login Suite', tests: 32 },
  { key: 'inventory', label: 'Inventory Suite', tests: 41 },
  { key: 'purchase', label: 'Purchase Order Suite', tests: 28 },
  { key: 'receiving', label: 'Receiving Suite', tests: 27 },
];

export const TOTAL_TESTS = SUITES.reduce((sum, s) => sum + s.tests, 0); // 128

// Console log lines streamed while a suite "runs". Failing suites end with
// the failure signature instead of a clean pass line.
export const SUITE_LOGS = {
  login: [
    "Running Login.spec.ts...",
    "  ✓ should render login form",
    "  ✓ should validate empty fields",
    "  ✓ should show error on invalid password",
    "  ✗ should log in with valid credentials",
    "Locator not found: #login",
    "Screenshot captured -> failures/login-01.png",
    "Trace saved -> traces/login-01.zip",
  ],
  inventory: [
    "Running Inventory.spec.ts...",
    "  ✓ should list all products",
    "  ✓ should filter by category",
    "  ✓ should sort by price",
    "  ✗ should save inventory changes",
    "Locator not found: //button[text()='Save']",
    "Screenshot captured -> failures/inventory-07.png",
    "Trace saved -> traces/inventory-07.zip",
  ],
  purchase: [
    "Running PurchaseOrder.spec.ts...",
    "  ✓ should create a new purchase order",
    "  ✓ should list pending orders",
    "  ✗ should submit purchase order for approval",
    "Element hidden: [data-testid='submit-po-button']",
    "Screenshot captured -> failures/purchase-order-03.png",
    "Trace saved -> traces/purchase-order-03.zip",
  ],
  receiving: [
    "Running Receiving.spec.ts...",
    "  ✓ should receive against a PO",
    "  ✓ should flag quantity mismatches",
    "  ✓ should close a receiving batch",
    "All tests passed.",
  ],
};

export const FAILURES = [
  {
    key: 'login',
    suite: 'Login Suite',
    title: 'Login Test',
    reason: 'Button locator changed.',
    healable: true,
  },
  {
    key: 'inventory',
    suite: 'Inventory Suite',
    title: 'Inventory Test',
    reason: 'DOM structure changed.',
    healable: true,
  },
  {
    key: 'purchase',
    suite: 'Purchase Order Suite',
    title: 'Purchase Order',
    reason: 'Element hidden after UI redesign.',
    healable: false,
  },
];

// Steps shown while the AI "thinks" through a healable failure.
export const HEALING_THOUGHT_STEPS = [
  'Analyzing Screenshot...',
  'Analyzing DOM...',
  'Comparing Previous Locator...',
  'Reading Playwright Trace...',
  'Checking HTML...',
  'Generating Better Locator...',
];

// Deeper root-cause steps for the one failure AI cannot heal — a backend
// issue rather than a UI/locator problem.
export const RCA_THOUGHT_STEPS = [
  'Analyzing Screenshot...',
  'Analyzing DOM...',
  'Element exists but is hidden — checking network activity...',
  'Inspecting API response for /api/purchase-orders/submit...',
  'Backend returned HTTP 500 — this is not a UI issue.',
];

export const HEALING_RESULTS = {
  login: {
    oldLocator: "#login",
    newLocator: "button[data-testid='login-button']",
    confidence: 96,
    reasoning:
      "I detected that the Login button locator changed after the UI redesign. " +
      "The previous selector was #login. The new DOM contains " +
      "button[data-testid='login-button']. I updated the locator and successfully " +
      "re-executed the test.",
    confidenceLabel: '97%',
  },
  inventory: {
    oldLocator: "//button[text()='Save']",
    newLocator: 'button:has-text("Save")',
    confidence: 94,
    reasoning:
      "The Save button's DOM structure changed — it no longer has a direct text node " +
      "matching the old XPath. I switched to Playwright's text-matching locator, which " +
      "is resilient to markup changes, and confirmed it resolves to the same element.",
    confidenceLabel: '94%',
  },
  purchase: {
    reasoning:
      "The Submit button is present in the DOM but hidden. Network logs show " +
      "POST /api/purchase-orders/submit returned HTTP 500 before the button was " +
      "meant to appear. This is a backend failure, not a locator or DOM issue — " +
      "AI cannot heal backend failures. Flagging for manual investigation.",
    status: 'Manual Investigation Required',
  },
};

export const HEALING_RETRY_LOGS = {
  login: ['Healing Started...', 'Applying new locator...', 'Retrying...', 'PASS ✓'],
  inventory: ['Healing Started...', 'Applying new locator...', 'Retrying...', 'PASS ✓'],
};

export const TIMELINE = [
  { time: '09:00', label: 'Regression Started', tone: 'info' },
  { time: '09:02', label: 'Login Failed', tone: 'fail' },
  { time: '09:03', label: 'AI Started Analysis', tone: 'ai' },
  { time: '09:04', label: 'Locator Updated', tone: 'ai' },
  { time: '09:05', label: 'Retry Passed', tone: 'pass' },
  { time: '09:08', label: 'Inventory Failed', tone: 'fail' },
  { time: '09:09', label: 'AI Healed', tone: 'pass' },
  { time: '09:12', label: 'Purchase Order Failed', tone: 'fail' },
  { time: '09:13', label: 'Backend Issue Found', tone: 'ai' },
  { time: '09:14', label: 'Manual Investigation Required', tone: 'warn' },
  { time: '09:15', label: 'Regression Completed', tone: 'info' },
];

export const REPORT_STATS = {
  suitesExecuted: 4,
  tests: 128,
  passed: 124,
  initiallyFailed: 3,
  aiHealed: 2,
  manualInvestigation: 1,
  successRate: 98,
  healingSuccess: 66,
};
