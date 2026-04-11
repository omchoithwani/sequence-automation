/**
 * register-actions.ts
 *
 * Creates or updates all three Custom Workflow Action (CWA v4) definitions
 * in your HubSpot developer app.  Safe to re-run — existing actions are
 * PATCHed so workflow editors pick up the latest field definitions immediately.
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
        optionsUrl: `${BASE_URL}/options/association-labels`,
      },
      isRequired: false,
      automationFieldType: 'NONE',
    },
  ],
  outputFields: [
    { typeDefinition: { name: 'enrolledCount', type: 'STRING', fieldType: 'TEXT' }, automationFieldType: 'NONE' },
    { typeDefinition: { name: 'failedCount',   type: 'STRING', fieldType: 'TEXT' }, automationFieldType: 'NONE' },
    { typeDefinition: { name: 'limitExceeded', type: 'STRING', fieldType: 'TEXT' }, automationFieldType: 'NONE' },
  ],
  labels: {
    en: {
      actionName: 'Enroll in Sequence',
      actionDescription:
        'Enroll a contact (or deal/company associations) into a HubSpot sequence. ' +
        'Enforces monthly enrollment limits based on your plan.',
      inputFieldLabels: {
        sequenceId: 'Sequence',
        senderId: 'Sender User',
        senderEmail: 'Sender Email',
        associationLabel: 'Association Label (deal/company workflows)',
      },
      outputFieldLabels: {
        enrolledCount: 'Contacts enrolled',
        failedCount: 'Contacts failed',
        limitExceeded: 'Monthly limit exceeded (true/false)',
      },
      actionCardContent: 'Enroll in sequence "{{sequenceId}}"',
    },
  },
};

const unenrollAction = {
  actionUrl: `${BASE_URL}/webhook/unenroll-sequence`,
  published: true,
  objectTypes: ['CONTACT', 'DEAL', 'COMPANY'],
  inputFields: [
    {
      typeDefinition: {
        name: 'sequenceId',
        type: 'STRING',
        fieldType: 'SELECT',
        // Includes "All active sequences" (__all__) as first option
        optionsUrl: `${BASE_URL}/options/sequences-all`,
      },
      isRequired: false,
      automationFieldType: 'NONE',
    },
    {
      typeDefinition: {
        name: 'associationLabel',
        type: 'STRING',
        fieldType: 'SELECT',
        optionsUrl: `${BASE_URL}/options/association-labels`,
      },
      isRequired: false,
      automationFieldType: 'NONE',
    },
  ],
  outputFields: [
    { typeDefinition: { name: 'unenrolledCount', type: 'STRING', fieldType: 'TEXT' }, automationFieldType: 'NONE' },
  ],
  labels: {
    en: {
      actionName: 'Unenroll from Sequence',
      actionDescription:
        'Cancel active sequence enrollment(s) for a contact, or for all contacts ' +
        'associated with a deal or company. Leave Sequence blank to cancel all active enrollments.',
      inputFieldLabels: {
        sequenceId: 'Sequence (blank = all active sequences)',
        associationLabel: 'Association Label (deal/company workflows)',
      },
      outputFieldLabels: {
        unenrolledCount: 'Enrollments cancelled',
      },
      actionCardContent: 'Unenroll from {{sequenceId}}',
    },
  },
};

const branchAction = {
  actionUrl: `${BASE_URL}/webhook/random-branch`,
  published: true,
  objectTypes: ['CONTACT', 'DEAL', 'COMPANY'],
  inputFields: [
    {
      typeDefinition: { name: 'percentage', type: 'NUMBER', fieldType: 'NUMBER' },
      isRequired: true,
      automationFieldType: 'NONE',
    },
  ],
  outputFields: [
    { typeDefinition: { name: 'branch', type: 'STRING', fieldType: 'TEXT' }, automationFieldType: 'NONE' },
  ],
  labels: {
    en: {
      actionName: 'Random Branch',
      actionDescription: 'Routes contacts randomly to Branch A or Branch B based on a percentage split.',
      inputFieldLabels: { percentage: 'Percentage for Branch A (0–100)' },
      outputFieldLabels: { branch: 'Result (A or B)' },
      actionCardContent: '{{percentage}}% chance → Branch A',
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ExistingAction { id: number; name: string; }

async function listExisting(): Promise<ExistingAction[]> {
  try {
    const res = await axios.get(ACTIONS_URL, AUTH);
    return (res.data.results as any[]).map((a) => ({
      id: a.id as number,
      name: (a.labels?.en?.actionName ?? '') as string,
    }));
  } catch { return []; }
}

async function create(action: object, name: string): Promise<void> {
  const res = await axios.post(ACTIONS_URL, action, AUTH);
  console.log(`  ✓ Created  "${name}" (id: ${res.data.id})`);
}

async function update(id: number, action: object, name: string): Promise<void> {
  await axios.patch(`${ACTIONS_URL}/${id}`, action, AUTH);
  console.log(`  ✓ Updated  "${name}" (id: ${id})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Syncing CWA definitions for app ${APP_ID} → ${BASE_URL}\n`);
  const existing = await listExisting();

  for (const [action, name] of [
    [enrollAction,   'Enroll in Sequence'],
    [unenrollAction, 'Unenroll from Sequence'],
    [branchAction,   'Random Branch'],
  ] as [object, string][]) {
    const found = existing.find((e) => e.name === name);
    if (found) await update(found.id, action, name);
    else       await create(action, name);
  }

  console.log('\nDone. Workflow editors will see updated definitions immediately.');
}

main().catch((err) => {
  console.error('Error:', err?.response?.data ?? err.message);
  process.exit(1);
});
