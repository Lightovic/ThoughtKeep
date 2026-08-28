/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';

interface CopyMessageButtonProps {
  textToCopy: string;
  isUserMessage?: boolean;
  messageElementId?: string;
}

export const CopyMessageButton: React.FC<CopyMessageButtonProps> = ({
  textToCopy,
  isUserMessage = false,
  messageElementId,
}) => {
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Determine what to copy: check if text is selected inside this message
    let payloadToCopy = textToCopy;
    const currentSelection = window.getSelection();
    if (currentSelection && !currentSelection.isCollapsed) {
      const selectedString = currentSelection.toString().trim();
      if (selectedString.length > 0) {
        // If messageElementId is provided, check if selection is contained within this message
        if (messageElementId) {
          const msgEl = document.getElementById(messageElementId);
          if (msgEl) {
            let isInside = false;
            for (let i = 0; i < currentSelection.rangeCount; i++) {
              const range = currentSelection.getRangeAt(i);
              if (
                msgEl.contains(range.commonAncestorContainer) ||
                msgEl.contains(currentSelection.anchorNode) ||
                msgEl.contains(currentSelection.focusNode)
              ) {
                isInside = true;
                break;
              }
            }
            if (isInside || textToCopy.includes(selectedString)) {
              payloadToCopy = currentSelection.toString();
            }
          } else if (textToCopy.includes(selectedString)) {
            payloadToCopy = currentSelection.toString();
          }
        } else if (textToCopy.includes(selectedString)) {
          payloadToCopy = currentSelection.toString();
        }
      }
    }

    let success = false;
    // Primary: Modern Async Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(payloadToCopy);
        success = true;
      } catch {
        success = false;
      }
    }

    // Fallback: execCommand for iframe or restricted clipboard environments
    if (!success && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = payloadToCopy;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      setErrorMessage(null);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } else {
      setCopied(false);
      setErrorMessage("Couldn't copy that message. Please try again.");
      setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleCopy}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={copied ? 'Message copied' : 'Copy message text'}
        title="Copy message"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 ${
          isUserMessage
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-500 shrink-0" />
            <span className="text-emerald-500 font-semibold">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3 shrink-0" />
            <span>Copy</span>
          </>
        )}
      </button>

      {errorMessage && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-full mb-1 right-0 z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-[11px] text-white shadow-md flex items-center gap-1.5"
        >
          <AlertCircle className="h-3 w-3 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
