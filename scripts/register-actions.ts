/**
 * register-actions.ts
 *
 * Creates or updates the two Custom Workflow Action (CWA v4) definitions
 * in your HubSpot developer app.  Safe to run multiple times — existing
 * actions are updated in place via PATCH so workflow editors see the latest
 * field definitions immediately.
 *
 *   npm run register-actions
 */

import axios from 'axios';
import 'dotenv/config';

const APP_ID = process.env.HUBSPOT_APP_ID!;
const DEV_KEY = process.env.HUBSPOT_DEVELOPER_API_KEY!;
const BASE_URL = process.env.BASE_URL!;

if (!APP_ID || !DEV_KEY || !BASE_URL) {
  console.error('Set HUBSPOT_APP_ID, HUBSPOT_DEVELOPER_API_KEY and BASE_URL in .env');
  process.exit(1);
}

const HUBAPI = 'https://api.hubapi.com';
const ACTIONS_URL = `${HUBAPI}/automation/v4/actions/${APP_ID}`;
const AUTH = { params: { hapikey: DEV_KEY } };

// ── Action definitions ────────────────────────────────────────────────────────

/**
 * "Enroll in Sequence" action.
 *
 * Works in contact, deal, and company workflows:
 *   - Contact   → enroll directly
 *   - Deal/Company → traverse associations (filtered by label if set)
 *
 * Output fields let subsequent if/then branches check enrolledCount / failedCount.
 */
const enrollAction = {
  actionUrl: `${BASE_URL}/webhook/enroll-sequence`,
  published: true,
  objectTypes: ['CONTACT', 'DEAL', 'COMPANY'],
  inputFields: [
    {
      typeDefinition: {
        name: 'sequenceId',
        type: 'STRING',
        fieldType: 'SELECT',
        optionsUrl: `${BASE_URL}/options/sequences`,
      },
      isRequired: true,
      automationFieldType: 'NONE',
    },
    {
      typeDefinition: {
        name: 'senderId',
        type: 'STRING',
        fieldType: 'SELECT',
        optionsUrl: `${BASE_URL}/options/users`,
      },
      isRequired: true,
      automationFieldType: 'NONE',
    },
    {
      typeDefinition: {
        name: 'senderEmail',
        type: 'STRING',
        fieldType: 'SELECT',
        // Dependent dropdown — re-fetched when senderId changes
        optionsUrl: `${BASE_URL}/options/sender-emails`,
      },
      isRequired: true,
      automationFieldType: 'NONE',
    },
    {
      typeDefinition: {
        name: 'associationLabel',
        type: 'STRING',
        fieldType: 'SELECT',
        // Shows named association labels + "All" / "Standard" fallbacks
        optionsUrl: `${BASE_URL}/options/association-labels`,
      },
      // Optional — ignored for contact workflows; defaults to all contacts for deal/company
      isRequired: false,
      automationFieldType: 'NONE',
    },
  ],
  outputFields: [
    {
      typeDefinition: { name: 'enrolledCount', type: 'STRING', fieldType: 'TEXT' },
      automationFieldType: 'NONE',
    },
    {
      typeDefinition: { name: 'failedCount', type: 'STRING', fieldType: 'TEXT' },
      automationFieldType: 'NONE',
    },
  ],
  labels: {
    en: {
      actionName: 'Enroll in Sequence',
      actionDescription:
        'Enroll a contact (or deal/company associations) into a HubSpot sequence. ' +
        'Choose the sender, email address, and optionally filter by association label.',
      inputFieldLabels: {
        sequenceId: 'Sequence',
        senderId: 'Sender User',
        senderEmail: 'Sender Email',
        associationLabel: 'Association Label (deal/company workflows)',
      },
      outputFieldLabels: {
        enrolledCount: 'Contacts enrolled',
        failedCount: 'Contacts failed',
      },
      actionCardContent: 'Enroll in sequence "{{sequenceId}}"',
    },
  },
};

/**
 * "Random Branch" action.
 *
 * Works in any object type workflow (contact, deal, company, …).
 * After this action, add an If/then branch:
 *   "Result (A or B)" equals "A"  →  Path A
 *   All others                    →  Path B
 */
const branchAction = {
  actionUrl: `${BASE_URL}/webhook/random-branch`,
  published: true,
  objectTypes: ['CONTACT', 'DEAL', 'COMPANY'],
  inputFields: [
    {
      typeDefinition: {
        name: 'percentage',
        type: 'NUMBER',
        fieldType: 'NUMBER',
      },
      isRequired: true,
      automationFieldType: 'NONE',
    },
  ],
  outputFields: [
    {
      typeDefinition: { name: 'branch', type: 'STRING', fieldType: 'TEXT' },
      automationFieldType: 'NONE',
    },
  ],
  labels: {
    en: {
      actionName: 'Random Branch',
      actionDescription: 'Routes contacts randomly to Branch A or Branch B based on a percentage split.',
      inputFieldLabels: {
        percentage: 'Percentage for Branch A (0–100)',
      },
      outputFieldLabels: {
        branch: 'Result (A or B)',
      },
      actionCardContent: '{{percentage}}% chance → Branch A',
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ExistingAction {
  id: number;
  name: string;
}

async function listExisting(): Promise<ExistingAction[]> {
  try {
    const res = await axios.get(ACTIONS_URL, AUTH);
    return (res.data.results as any[]).map((a) => ({
      id: a.id as number,
      name: (a.labels?.en?.actionName ?? '') as string,
    }));
  } catch {
    return [];
  }
}

async function create(action: object, name: string): Promise<void> {
  const res = await axios.post(ACTIONS_URL, action, AUTH);
  console.log(`  ✓ Created "${name}" (definitionId: ${res.data.id})`);
}

async function update(definitionId: number, action: object, name: string): Promise<void> {
  await axios.patch(`${ACTIONS_URL}/${definitionId}`, action, AUTH);
  console.log(`  ✓ Updated "${name}" (definitionId: ${definitionId})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Syncing CWA definitions for app ${APP_ID} → ${BASE_URL}\n`);

  const existing = await listExisting();

  for (const [action, name] of [
    [enrollAction, 'Enroll in Sequence'],
    [branchAction, 'Random Branch'],
  ] as [object, string][]) {
    const found = existing.find((e) => e.name === name);
    if (found) {
      await update(found.id, action, name);
    } else {
      await create(action, name);
    }
  }

  console.log('\nDone. Workflow editors will see the updated definitions immediately.');
}

main().catch((err) => {
  console.error('Error:', err?.response?.data ?? err.message);
  process.exit(1);
});
