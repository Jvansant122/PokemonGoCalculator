import { type ReactNode, useState } from "react";
import { readCollapsibleOpen, writeCollapsibleOpen } from "./collapsibleState.js";

export interface CollapsibleSectionProps {
  /**
   * Stable string id used as this section's localStorage key (see
   * collapsibleState.ts) — NEVER derived from an array index or any value
   * that can shuffle (a species name, a row position), or reordering would
   * silently reassign someone else's saved fold state to a different
   * section. Scope it per tab (e.g. "comparator-known-caveats") so two tabs
   * never share one fold state by accident.
   */
  id: string;
  /**
   * Rendered as a real heading element INSIDE <summary> — so it stays a
   * real, always-visible, accessibly-named heading (this project's
   * Playwright suite locates sections by heading text) even while the body
   * below is collapsed. Put any "useful count or headline" here (e.g.
   * "Benched but promising — 24 rows") so a collapsed section's summary
   * line still carries its payload rather than just its title.
   */
  heading: ReactNode;
  headingLevel?: "h2" | "h3";
  /** Used only on first visit / when storage is unavailable — see collapsibleState.ts. */
  defaultOpen: boolean;
  children: ReactNode;
  /**
   * "panel" (default): a full `section.panel` replacement — use this for a
   * top-level section this collapsible is replacing wholesale, styled
   * identically to a non-collapsible `.panel` so folded and unfolded
   * sections don't read as different products. "subsection": a lighter,
   * nested block for a collapsible sub-block living INSIDE an
   * already-a-panel section (e.g. the Power-Up Optimizer's "Benched but
   * promising" table nested inside its "Multi-raid sweep" panel).
   */
  variant?: "panel" | "subsection";
  className?: string;
}

/**
 * The ONE shared collapsible-section component for this app — built on
 * native `<details>`/`<summary>` (this repo already used that element in
 * RosterImportPanel.tsx and bossCadence.tsx before this component existed)
 * rather than a hand-rolled div+onClick, since native `<details>` gives
 * keyboard access and disclosure-widget screen-reader semantics for free.
 * Every call site should go through this component rather than a
 * per-tab-hand-rolled one, so collapsed and non-collapsed sections always
 * look and behave like the same product.
 *
 * Fold state persists per browser via collapsibleState.ts — deliberately
 * NOT a Scenario field (see that module's own doc comment).
 */
export function CollapsibleSection({ id, heading, headingLevel = "h2", defaultOpen, children, variant = "panel", className }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => readCollapsibleOpen(id, defaultOpen));
  const Heading = headingLevel;
  const variantClass = variant === "panel" ? "panel collapsible-panel" : "collapsible-subsection";
  return (
    <details
      className={className ? `${variantClass} ${className}` : variantClass}
      open={open}
      onToggle={(event) => {
        const next = (event.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
        writeCollapsibleOpen(id, next);
      }}
    >
      <summary>
        <Heading>{heading}</Heading>
      </summary>
      {children}
    </details>
  );
}
