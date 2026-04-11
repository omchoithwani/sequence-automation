/**
 * register-actions.ts
 *
 * One-time setup script that creates the two Custom Workflow Action (CWA v4)
 * definitions in your HubSpot developer app.  Run this once after deploying:
 *
 *   npm run register-actions
 *
 * If an action already exists it is left unchanged.
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
  objectTypes: ['CONTACT'],
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
        // Dependent dropdown – re-fetched when senderId changes
        optionsUrl: `${BASE_URL}/options/sender-emails`,
      },
      isRequired: true,
      automationFieldType: 'NONE',
    },
  ],
  outputFields: [],
  labels: {
    en: {
      actionName: 'Enroll in Sequence',
      actionDescription:
        'Automatically enroll a contact into a HubSpot sequence with a chosen sender and email address.',
      inputFieldLabels: {
        sequenceId: 'Sequence',
        senderId: 'Sender User',
        senderEmail: 'Sender Email',
      },
      actionCardContent: 'Enroll in sequence "{{sequenceId}}"',
    },
  },
};

const branchAction = {
  actionUrl: `${BASE_URL}/webhook/random-branch`,
  published: true,
  objectTypes: ['CONTACT'],
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
      typeDefinition: {
        name: 'branch',
        type: 'STRING',
        fieldType: 'TEXT',
      },
      automationFieldType: 'NONE',
    },
  ],
  labels: {
    en: {
      actionName: 'Random Branch',
      actionDescription:
        'Routes a contact randomly to Branch A or Branch B based on a percentage split.',
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

async function listExisting(): Promise<string[]> {
  try {
    const res = await axios.get(ACTIONS_URL, AUTH);
    return (res.data.results as any[]).map((a: any) => a.labels?.en?.actionName as string);
  } catch {
    return [];
  }
}

async function create(action: object, name: string): Promise<void> {
  const res = await axios.post(ACTIONS_URL, action, AUTH);
  console.log(`  Created "${name}" (definitionId: ${res.data.id})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Registering CWA definitions for app ${APP_ID}…`);
  const existing = await listExisting();

  for (const [action, name] of [
    [enrollAction, 'Enroll in Sequence'],
    [branchAction, 'Random Branch'],
  ] as [object, string][]) {
    if (existing.includes(name)) {
      console.log(`  Skipped "${name}" (already exists)`);
    } else {
      await create(action, name);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err?.response?.data ?? err.message);
  process.exit(1);
});
