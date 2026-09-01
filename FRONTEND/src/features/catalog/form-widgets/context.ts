import type { ReactNode } from 'react';
import type {
  FieldDefinition,
  FormPageKind,
  PagePlacement,
  StakeholderDirectory,
  StakeholdersInput,
} from '../metamodel';

/**
 * What the SLA policy would promise for a record that does not exist yet.
 *
 * The DURATIONS are the honest part and the reason this type is not just a
 * `SlaAssessment`: the due instants drift between the moment the widget
 * renders and the moment the user actually submits, while "4 hours to
 * respond" stays true. The instants are shown as an estimate, never as a
 * commitment.
 */
export interface FormSlaPreview {
  policyId: string;
  policyVersion: number;
  priority: string;
  responseTargetMinutes: number;
  resolutionTargetMinutes: number;
  responseDueAt?: string;
  resolutionDueAt?: string;
}

export interface PendingFormAttachment {
  id: string;
  name: string;
  size: number;
  type?: string;
}

/**
 * Everything a create/edit form page needs to render, in the same spirit as
 * TicketPageContext: assembled once by whoever owns the data (the real form,
 * or the designer's simulator) and consumed by widgets that never fetch
 * anything themselves.
 */
export interface FormPageContext {
  entityKey: string;
  kind: FormPageKind;
  /** true on the designer canvas and in the preview; false on the real form. */
  preview: boolean;

  definitionName: string;
  definitionVersion?: number;
  description: string;
  /** Only on `edit` — the record being edited. */
  humanId?: string;

  fields: FieldDefinition[];
  data: Record<string, unknown>;

  /**
   * The ONLY way a field placement becomes an input.
   *
   * It lives on the context rather than in the dispatcher because only the
   * runtime knows about the resource/agent/site/asset queries a `bindsTo`
   * field needs. That keeps the dispatcher three lines long and identical
   * across the canvas, the preview and the real page — the thing that makes
   * the designed form and the shipped form the same form.
   */
  renderField: (placement: PagePlacement) => ReactNode;

  requester: { displayName: string; email?: string };

  stakeholders: {
    directory?: StakeholderDirectory;
    loading: boolean;
    errorMessage?: string;
    value: StakeholdersInput;
    readOnly?: boolean;
    hidden?: boolean;
    onChange: (value: StakeholdersInput) => void;
    onRetry: () => void;
  };

  sla: {
    state: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';
    preview?: FormSlaPreview;
    /** Why no preview is available — shown verbatim for `unavailable`. */
    message?: string;
    onRetry: () => void;
  };

  /** Files staged in the browser and uploaded only after the record exists. */
  attachments: {
    items: PendingFormAttachment[];
    maxFiles: number;
    maxBytesPerFile: number;
    canRemove?: boolean;
    errorMessage?: string;
    onAddFiles: (files: File[]) => void;
    onRemove: (id: string) => void;
  };

  submit: {
    submitLabel: string;
    cancelLabel: string;
    pending: boolean;
    /** A rejection from the server. */
    errorMessage?: string;
    /** A local validation notice, raised before anything was sent. */
    warningMessage?: string;
    onCancel: () => void;
    disabled: boolean;
  };
}
