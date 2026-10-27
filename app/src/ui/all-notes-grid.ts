/**
 * AllNotesGrid: every note, as cards in rows, for the Recent panel's
 * "Show all" view (a vertically scrolling area in the dock).
 *
 * The dock markup is static, so these cards are built here as notes appear,
 * from the same classes as Recent's cards (.note-card and friends in
 * compact-dock.uikitml, which UIKit keeps in its shared stylesheet). Cards
 * are reused as the list changes; spare ones hide.
 */

import { UIKit } from '@iwsdk/core';
import type { Note } from '../notes/note-model.js';
import type { NoteSummary } from '../notes/note-store.js';
import { formatRelativeTime, truncate } from './format.js';
import { addStateColors, NEUTRAL_STATES, setText, setVisible, type PanelElement } from './panel-helpers.js';
import { NoteThumbnail } from './paper-preview.js';
import { addPressMotion } from './press-motion.js';
import type { Tweens } from './tweens.js';

export interface AllNotesGridOptions {
  /** Cards per row; matches Recent's grid. */
  perRow: number;
  titleMaxChars: number;
  thumbnailPx: number;
  tweens: Tweens;
  cleanupFuncs: Array<() => void>;
  loadNote: (id: string) => Promise<Note | null>;
  onOpen: (id: string) => void;
}

interface GridCard {
  root: PanelElement;
  image: PanelElement;
  title: UIKit.Text;
  meta: UIKit.Text;
  thumbnail: NoteThumbnail;
  noteId: string | null;
}

export class AllNotesGrid {
  private readonly rows: PanelElement[] = [];
  private readonly cards: GridCard[] = [];

  constructor(
    private readonly area: PanelElement,
    private readonly options: AllNotesGridOptions,
  ) {}

  /**
   * Show these notes, in order. `shown` says whether the view is on screen:
   * images are hidden with it, because a hidden section's images otherwise
   * keep drawing at stale positions.
   */
  render(summaries: readonly NoteSummary[], shown: boolean): void {
    while (this.cards.length < summaries.length) this.addCard();
    this.cards.forEach((card, i) => {
      const summary = summaries[i];
      card.noteId = summary?.id ?? null;
      setVisible(card.root, summary !== undefined);
      setVisible(card.image, summary !== undefined && shown);
      if (!summary) return;
      setText(card.title, truncate(summary.title || 'Untitled note', this.options.titleMaxChars));
      setText(card.meta, `Edited ${formatRelativeTime(summary.updatedAt)}`);
      if (shown) void card.thumbnail.show(summary, this.options.loadNote);
    });
    this.rows.forEach((row, r) => setVisible(row, summaries.length > r * this.options.perRow));
  }

  /** UIKit images do not inherit opacity; the dock fades them directly. */
  setOpacity(opacity: number): void {
    for (const card of this.cards) card.image.setProperties({ opacity } as Record<string, unknown>);
  }

  private addCard(): void {
    const { perRow, thumbnailPx, tweens, cleanupFuncs } = this.options;
    if (this.cards.length % perRow === 0) {
      // Rows keep their height: the scroll area clips them rather than squashing.
      const row = new UIKit.Container({ flexShrink: 0 }, ['grid-row']);
      this.area.add(row);
      this.rows.push(row);
    }
    const thumbnail = new NoteThumbnail(thumbnailPx);
    const image = new UIKit.Image({ src: thumbnail.texture }, ['note-thumb']);
    const paper = new UIKit.Container({}, ['note-paper']);
    paper.add(image);
    const title = new UIKit.Text({ text: 'Note' }, ['note-title']);
    const meta = new UIKit.Text({ text: 'Edited' }, ['note-meta']);
    const text = new UIKit.Container({}, ['note-text']);
    text.add(title, meta);
    const root = new UIKit.Container({}, ['note-card']);
    root.add(paper, text);
    this.rows[this.rows.length - 1].add(root);

    const card: GridCard = { root, image, title, meta, thumbnail, noteId: null };
    const open = () => {
      if (card.noteId) this.options.onOpen(card.noteId);
    };
    root.addEventListener('click', open);
    addStateColors(root, NEUTRAL_STATES, cleanupFuncs);
    addPressMotion(root, tweens, cleanupFuncs);
    cleanupFuncs.push(() => {
      root.removeEventListener('click', open);
      thumbnail.dispose();
    });
    this.cards.push(card);
  }
}
