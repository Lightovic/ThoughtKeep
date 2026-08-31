/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Server, CheckCircle2, X } from 'lucide-react';

interface SecurityAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ControlStatus = 'ENFORCED' | 'PARTIAL' | 'PLANNED' | 'NOT_IMPLEMENTED';

interface SecurityControl {
  directive: string;
  description: string;
  location: string;
  status: ControlStatus;
  statusNote?: string;
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({ isOpen, onClose }) => {
  const [serverHealth, setServerHealth] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      checkHealth();
    }
  }, [isOpen]);

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setServerHealth(data);
      }
    } catch {
      setServerHealth({ status: 'offline' });
    }
  };

  if (!isOpen) return null;

  const controls: SecurityControl[] = [
    {
      directive: '1. Threat Modeling',
      description: '5-zone threat analysis (Input, Reasoning, Tools, Memory, Communication) applied across backend handlers and routes.',
      location: 'server/auth.ts, server/gemini.ts, server/screening.ts',
      status: 'ENFORCED',
    },
    {
      directive: '2. Identity Server-Verified',
      description: 'Firebase ID token validated cryptographically via Firebase Admin SDK with email_verified requirement and Google provider check. UID derived on server.',
      location: 'server/auth.ts:verifyFirebaseIdToken',
      status: 'ENFORCED',
    },
    {
      directive: '3. Owner-Bound Storage',
      description: 'All user data isolated under users/{userId}/ with Firestore security rules rejecting cross-user access and making audit trail client-immutable.',
      location: 'firestore.rules',
      status: 'ENFORCED',
    },
    {
      directive: '4. Secret Isolation',
      description: 'Gemini API key read on server from environment variables; zero keys in browser. (Uses platform environment injection rather than direct Secret Manager SDK client).',
      location: 'server/gemini.ts:getGeminiClient',
      status: 'PARTIAL',
      statusNote: 'Server-side env var; direct Secret Manager SDK integration planned',
    },
    {
      directive: '5. Screening Choke Points',
      description: 'Centralized screenInbound & screenOutbound choke points intercept all model I/O, validating length and enforcing AI boundaries. ML-based scanning is planned for Model Armor integration.',
      location: 'server/screening.ts',
      status: 'PARTIAL',
      statusNote: 'Baseline choke points active; Model Armor ML integration planned in Phase 2',
    },
    {
      directive: '6. Prompt Injection Resistance',
      description: 'System prompt isolates user input as reflective data; structural boundaries prevent instruction leakage. ML injection classification planned for Model Armor.',
      location: 'server/gemini.ts:JOURNAL_SYSTEM_INSTRUCTION',
      status: 'PARTIAL',
      statusNote: 'Prompt-level isolation enforced; Model Armor injection filter planned',
    },
    {
      directive: '7. Discussion Allowed',
      description: 'Security and technical vocabulary welcomed in journal without naive keyword bans.',
      location: 'server/gemini.ts',
      status: 'ENFORCED',
    },
    {
      directive: '8. Least Privilege & Confirmation',
      description: 'Explicit human confirmation required with plain-language preview for save, delete, and session reset.',
      location: 'src/components/ConfirmationModal.tsx',
      status: 'ENFORCED',
    },
    {
      directive: '9 & 16. Audit Logging',
      description: 'Structured audit logger emits JSON events with sanitized resource IDs and strict redaction of tokens, secrets, and raw personal content.',
      location: 'server/logger.ts:logSecurityEvent',
      status: 'ENFORCED',
    },
    {
      directive: '10. Fail Closed & Kindly',
      description: 'On auth or generation failure, access is denied and calm, non-technical plain language feedback is provided to the user.',
      location: 'server/auth.ts, server/gemini.ts',
      status: 'ENFORCED',
    },
    {
      directive: '14. AI Boundary Enforcement',
      description: 'Entries marked "Never send this entry to AI" are excluded from all model context, screening choke points fail closed, and summarization is bypassed.',
      location: 'server/screening.ts, server/gemini.ts, src/components/JournalChat.tsx',
      status: 'ENFORCED',
    },
  ];

  const getStatusBadge = (status: ControlStatus) => {
    switch (status) {
      case 'ENFORCED':
        return (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
            ENFORCED
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-600/20">
            PARTIAL
          </span>
        );
      case 'PLANNED':
        return (
          <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-600/20">
            PLANNED
          </span>
        );
      case 'NOT_IMPLEMENTED':
        return (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-400/20">
            NOT IMPLEMENTED
          </span>
        );
    }
  };

  return (
    <div
      id="security-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-modal-title"
    >
      <div
        id="security-modal-card"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 id="security-modal-title" className="text-base font-semibold text-slate-900">
                ThoughtKeep Security & Privacy Directives
              </h2>
              <p className="text-xs text-slate-500">
                Active security posture and verified controls
              </p>
            </div>
          </div>

          <button
            id="close-security-modal-btn"
            type="button"
            onClick={onClose}
            aria-label="Close security modal"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Server Readiness Status */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-medium text-slate-800">
                <Server className="h-4 w-4 text-slate-600" />
                <span>Backend Health Status:</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" />
                  {serverHealth?.status === 'ok' ? 'Operational & Protected' : 'Checking...'}
                </span>
              </div>
              <span className="text-slate-400 font-mono">GCP: true-rampart-464602-i0</span>
            </div>
          </div>

          {/* Directives Table */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Security Controls Audit
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[900px] w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold">
                  <tr>
                    <th scope="col" className="px-3.5 py-2.5">Directive</th>
                    <th scope="col" className="px-3.5 py-2.5">Control Mechanism</th>
                    <th scope="col" className="px-3.5 py-2.5">Enforcement Location</th>
                    <th scope="col" className="px-3.5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {controls.map((ctrl, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-3.5 py-3 font-medium text-slate-900 whitespace-nowrap align-top">
                        {ctrl.directive}
                      </td>
                      <td className="px-3.5 py-3 text-slate-600 leading-relaxed align-top">
                        <div>{ctrl.description}</div>
                        {ctrl.statusNote && (
                          <div className="mt-1 text-[11px] text-amber-700 font-medium">
                            Note: {ctrl.statusNote}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 font-mono text-[11px] text-slate-500 align-top">
                        {ctrl.location}
                      </td>
                      <td className="px-3.5 py-3 align-top">
                        {getStatusBadge(ctrl.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50/50 flex justify-end">
          <button
            id="dismiss-security-modal-footer-btn"
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            Close Posture Review
          </button>
        </div>
      </div>
    </div>
  );
};
