import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, drawSelection, lineNumbers, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { renderMarkdown } from '../core/markdown';
import { RevisionRenderer } from '../core/revisions';
import { clipboardPayload } from '../core/clipboard';
import { bindScrollSync } from './scroll-sync';
import { loadPreferences, savePreferences } from '../core/preferences';
import type { AppAction, RenderedDocument } from '../shared/types';
import logo from '../../assets/apetek-logo.png';
import './style.css';


function App() {
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const sync = useRef<ReturnType<typeof bindScrollSync> | null>(null);
  const syncEnabled = useRef(true);
  const [linked, setLinked] = useState(true);
  const [split, setSplit] = useState(50);
  const [source, setSource] = useState('');
  const [document, setDocument] = useState<RenderedDocument>({ html: '', plainText: '' });
  const visibleDocument = useRef(document);
  visibleDocument.current = document;
  const [rendering, setRendering] = useState(true);
  const [status, setStatus] = useState('Ready');
  const [copyState, setCopyState] = useState('idle');
  const [preferences, setPreferences] = useState(loadPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsHost = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const savedSource = useRef<string | null>('');
  const current = useRef({ source: '', path: null as string | null, dirty: false });
  const action = useRef<(action: AppAction) => Promise<void>>(async () => {});
  const actionBusy = useRef(false);
  const editable = useMemo(() => new Compartment(), []);
  const undoHistory = useMemo(() => new Compartment(), []);
  const recoveryReady = useRef<Promise<void>>(Promise.resolve());
  const documentVersion = useRef(0);
  const copyFeedbackVersion = useRef(0);
  const renderer = useMemo(() => new RevisionRenderer<RenderedDocument>(value => { setDocument(value); setRendering(false); }), []);
  const invalidateCopyFeedback = useCallback(() => {
    copyFeedbackVersion.current++;
    setCopyState('idle');
    setStatus(value => value === 'Copied rendered document' || value === 'Copied selected passage' ? 'Ready' : value);
  }, []);

  useEffect(() => { savePreferences(preferences); }, [preferences]);

  useEffect(() => {
    if (!settingsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!settingsHost.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSettingsOpen(false); settingsHost.current?.querySelector('button')?.focus(); }
    };
    const wheel = (event: WheelEvent) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'range' || !event.deltaY) return;
      const field = input.dataset.preference;
      if (field !== 'mathScale' && field !== 'lineSpacing' && field !== 'paragraphSpacing' && field !== 'bulletLineSpacing' && field !== 'bulletSpacing') return;
      event.preventDefault();
      const step = Number(input.step), min = Number(input.min), max = Number(input.max);
      setPreferences(value => ({ ...value, [field]: Math.min(max, Math.max(min,
        Math.round((value[field] + (event.deltaY < 0 ? step : -step)) * 100) / 100)) }));
    };
    window.document.addEventListener('pointerdown', dismiss);
    window.document.addEventListener('keydown', escape);
    const host = settingsHost.current;
    host?.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.document.removeEventListener('pointerdown', dismiss);
      window.document.removeEventListener('keydown', escape);
      host?.removeEventListener('wheel', wheel);
    };
  }, [settingsOpen]);

  useEffect(() => {
    const view = new EditorView({ parent: editorHost.current!, state: EditorState.create({ doc: '', extensions: [
      lineNumbers(), undoHistory.of(history()), drawSelection(), markdown(), syntaxHighlighting(defaultHighlightStyle), highlightSelectionMatches(), EditorView.lineWrapping,
      editable.of([EditorState.readOnly.of(true), EditorView.editable.of(false)]),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown source', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'false' }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) sync.current?.refresh('source');
        else if (update.viewportChanged || update.geometryChanged) sync.current?.refresh();
        if (update.docChanged) {
          documentVersion.current++;
          invalidateCopyFeedback();
          const content = update.state.doc.toString();
          current.current.source = content;
          current.current.dirty = content !== savedSource.current;
          setSource(content); setDirty(current.current.dirty);
        }
      }),
    ] }) });
    editor.current = view;
    sync.current = bindScrollSync(view, preview.current!, () => syncEnabled.current);
    return () => { sync.current?.destroy(); sync.current = null; view.destroy(); editor.current = null; };
  }, [invalidateCopyFeedback]);

  useEffect(() => { sync.current?.refresh(); }, [document, split]);

  useEffect(() => {
    const controller = new AbortController();
    setRendering(true);
    invalidateCopyFeedback();
    renderer.update(async () => {
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(controller.signal.reason); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve(); }, 80);
        controller.signal.addEventListener('abort', cancel, { once: true });
      });
      controller.signal.throwIfAborted();
      return renderMarkdown(source, {
        renderAsset: request => window.desktop.renderAsset(request),
        resolveImage: image => window.desktop.readImage(image, filePath),
        mathAlignment: preferences.mathAlignment, mathScale: preferences.mathScale,
        lineSpacing: preferences.lineSpacing, paragraphSpacing: preferences.paragraphSpacing,
        bulletLineSpacing: preferences.bulletLineSpacing, bulletSpacing: preferences.bulletSpacing,
        signal: controller.signal,
      });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setRendering(false); setStatus(String(error));
    });
    return () => controller.abort();
  }, [source, filePath, renderer, invalidateCopyFeedback, preferences.mathAlignment, preferences.mathScale, preferences.lineSpacing, preferences.paragraphSpacing, preferences.bulletLineSpacing, preferences.bulletSpacing]);

  function replaceDocument(content: string, path: string | null, unsaved = false) {
    documentVersion.current++;
    invalidateCopyFeedback();
    savedSource.current = unsaved ? null : content;
    current.current = { source: content, path, dirty: unsaved };
    const view = editor.current!;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, selection: { anchor: 0 }, effects: undoHistory.reconfigure([]), annotations: Transaction.addToHistory.of(false) });
    view.dispatch({ effects: undoHistory.reconfigure(history()) });
    current.current = { source: content, path, dirty: unsaved };
    setSource(content); setFilePath(path); setDirty(unsaved);
    view.scrollDOM.scrollTop = 0;
  }

  useEffect(() => {
    let alive = true;
    recoveryReady.current = window.desktop.loadRecovery().then(draft => {
      if (alive && draft && !current.current.dirty) { replaceDocument(draft.content, draft.path, draft.dirty); setStatus(draft.dirty ? 'Recovered unsaved draft' : 'Opened document'); }
    }).catch(error => { if (alive) setStatus(String(error)); }).finally(() => {
      if (alive) {
        editor.current?.dispatch({ effects: editable.reconfigure([EditorState.readOnly.of(false), EditorView.editable.of(true)]) });
        setRecoveryLoaded(true);
      }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    window.desktop.setDocumentState({ path: filePath, dirty });
    if (!recoveryLoaded) return;
    const timer = setTimeout(() => {
      const operation = dirty ? window.desktop.persistRecovery({ path: filePath, content: source, dirty }) : window.desktop.discardRecovery();
      operation.catch(error => setStatus(`Recovery: ${String(error)}`));
    }, 350);
    return () => clearTimeout(timer);
  }, [source, filePath, dirty, recoveryLoaded]);

  async function save(saveAs = false): Promise<boolean> {
    const snapshot = { ...current.current };
    const path = await window.desktop.saveDocument({ path: snapshot.path, content: snapshot.source, saveAs });
    if (!path) return false;
    savedSource.current = snapshot.source;
    current.current.path = path;
    current.current.dirty = current.current.source !== snapshot.source;
    setFilePath(path); setDirty(current.current.dirty);
    setStatus(current.current.dirty ? 'Saved; newer edits are unsaved' : 'Saved Markdown');
    return !current.current.dirty;
  }

  async function settleUnsaved(): Promise<boolean> {
    if (!current.current.dirty) return true;
    const choice = await window.desktop.confirmDiscard();
    return choice === 'discard' || (choice === 'save' && await save());
  }

  action.current = async (name) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    try {
      await recoveryReady.current;
      if (name === 'save' || name === 'saveAs') { await save(name === 'saveAs'); return; }
      if (name === 'pdf') { await exportPdf(); return; }
      if (!await settleUnsaved()) return;
      if (name === 'new') { replaceDocument('', null); setStatus('New document'); }
      if (name === 'open') {
        const version = documentVersion.current;
        const opened = await window.desktop.openDocument();
        if (version !== documentVersion.current && !await settleUnsaved()) return;
        if (opened) { replaceDocument(opened.content, opened.path); setStatus('Opened Markdown'); }
      }
      if (name === 'close') { await window.desktop.discardRecovery(); window.desktop.setDocumentState({ path: current.current.path, dirty: false }); window.desktop.close(); }
    } catch (error) { setStatus(String(error)); }
    finally { actionBusy.current = false; }
  };
  useEffect(() => window.desktop.onAction(name => { void action.current(name); }), []);

  async function copyAll() {
    const version = ++copyFeedbackVersion.current;
    setCopyState('copying');
    try {
      const snapshot = await renderer.current();
      const content = preview.current!.ownerDocument.createElement('article');
      content.innerHTML = snapshot.html;
      await window.desktop.copyRendered(clipboardPayload(content));
      if (version !== copyFeedbackVersion.current) return;
      setCopyState('copied'); setStatus('Copied rendered document');
    } catch (error) {
      if (version !== copyFeedbackVersion.current) return;
      setCopyState('idle'); setStatus(String(error));
    }
  }

  async function exportPdf() {
    setExporting(true); setStatus('Preparing PDF…');
    try {
      const snapshot = await renderer.current();
      const destination = await window.desktop.exportPdf({ html: snapshot.html, pageSize: preferences.pageSize });
      setStatus(destination ? 'Exported PDF' : 'PDF export cancelled');
    } catch (error) { setStatus(String(error)); }
    finally { setExporting(false); }
  }

  useEffect(() => {
    const owner = preview.current!.ownerDocument;
    const onCopy = (event: ClipboardEvent) => {
      const selection = owner.getSelection();
      const content = preview.current!.querySelector<HTMLElement>('article')!;
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!range.intersectsNode(content)) return;
      const payload = clipboardPayload(content, range);
      if (!payload.html) return;
      event.preventDefault();
      const displayed = visibleDocument.current;
      const version = ++copyFeedbackVersion.current;
      setCopyState('copying');
      renderer.current().then(async latest => {
        if (latest !== displayed) {
          if (version === copyFeedbackVersion.current) { setCopyState('idle'); setStatus('Preview updated; select the passage again'); }
          return;
        }
        await window.desktop.copyRendered(payload);
        if (version !== copyFeedbackVersion.current) return;
        setCopyState('copied'); setStatus('Copied selected passage');
      }).catch(error => {
        if (version !== copyFeedbackVersion.current) return;
        setCopyState('idle'); setStatus(String(error));
      });
    };
    owner.addEventListener('copy', onCopy);
    return () => owner.removeEventListener('copy', onCopy);
  }, [renderer]);

  return <div className="app-shell">
    <header className="toolbar" role="toolbar" aria-label="Document toolbar"><div className="brand"><img className="brand-mark" src={logo} alt="ApeTek chimpanzee logo" /><div><strong>ApeTek</strong><small>LATEX FOR APES</small></div></div><button disabled={!recoveryLoaded} title="New document · Ctrl+N" aria-label="New document" onClick={() => void action.current('new')}>New</button><button disabled={!recoveryLoaded} title="Open Markdown · Ctrl+O" aria-label="Open Markdown" onClick={() => void action.current('open')}>Open</button><button disabled={!recoveryLoaded} title="Save Markdown · Ctrl+S" aria-label="Save Markdown" onClick={() => void action.current('save')}>Save</button><button disabled={!recoveryLoaded} title="Save as · Ctrl+Shift+S" aria-label="Save Markdown as" onClick={() => void action.current('saveAs')}>Save as</button><div className="settings" ref={settingsHost}>
      <button className="settings-button" aria-label="Document settings" aria-expanded={settingsOpen} aria-controls="document-settings" onClick={() => setSettingsOpen(value => !value)}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5h14M3 10h14M3 15h14" /><path d="M7 3v4M13 8v4M7 13v4" strokeWidth="3" /></svg>Settings</button>
      {settingsOpen && <div className="settings-popover" id="document-settings" role="dialog" aria-label="Document appearance"><h2>Document appearance</h2><label>Display equation blocks<select aria-label="Display equation blocks" value={preferences.mathAlignment} onChange={event => setPreferences(value => ({ ...value, mathAlignment: event.target.value as 'left' | 'center' }))}><option value="left">Left</option><option value="center">Center</option></select></label>
        <div className="range-setting"><span><label htmlFor="math-scale">LaTeX size</label><output htmlFor="math-scale">{preferences.mathScale}%</output></span><input id="math-scale" aria-label="LaTeX size" data-preference="mathScale" type="range" min="50" max="200" step="1" value={preferences.mathScale} onChange={event => setPreferences(value => ({ ...value, mathScale: Number(event.target.value) }))} /></div>
        <div className="range-setting"><span><label htmlFor="line-spacing">Line spacing</label><output htmlFor="line-spacing">{preferences.lineSpacing.toFixed(2).replace(/0$/, '')}×</output></span><input id="line-spacing" aria-label="Line spacing" data-preference="lineSpacing" type="range" min="1" max="3" step="0.05" value={preferences.lineSpacing} onChange={event => setPreferences(value => ({ ...value, lineSpacing: Number(event.target.value) }))} /></div>
        <div className="range-setting"><span><label htmlFor="paragraph-spacing">Paragraph spacing</label><output htmlFor="paragraph-spacing">{preferences.paragraphSpacing}px</output></span><input id="paragraph-spacing" aria-label="Paragraph spacing" data-preference="paragraphSpacing" type="range" min="0" max="40" step="1" value={preferences.paragraphSpacing} onChange={event => setPreferences(value => ({ ...value, paragraphSpacing: Number(event.target.value) }))} /></div>
        <div className="range-setting"><span><label htmlFor="bullet-line-spacing">Bullet line spacing</label><output htmlFor="bullet-line-spacing">{preferences.bulletLineSpacing.toFixed(2).replace(/0$/, '')}×</output></span><input id="bullet-line-spacing" aria-label="Bullet line spacing" data-preference="bulletLineSpacing" type="range" min="1" max="3" step="0.05" value={preferences.bulletLineSpacing} onChange={event => setPreferences(value => ({ ...value, bulletLineSpacing: Number(event.target.value) }))} /></div>
        <div className="range-setting"><span><label htmlFor="bullet-spacing">Between bullets</label><output htmlFor="bullet-spacing">{preferences.bulletSpacing}px</output></span><input id="bullet-spacing" aria-label="Between bullets" data-preference="bulletSpacing" type="range" min="0" max="40" step="1" value={preferences.bulletSpacing} onChange={event => setPreferences(value => ({ ...value, bulletSpacing: Number(event.target.value) }))} /></div>
        <p>Applies to the preview, copied content, and PDF.</p></div>}
    </div><span className="separator" /><div className="file-name" data-dirty={dirty} title={filePath || 'Untitled.md'}>{filePath?.split('/').pop() || 'Untitled.md'}{dirty && <span style={{ color: '#aa7c3b', marginLeft: 7 }}>●</span>}</div><button className="primary" data-testid="copy-rendered" data-copy-state={copyState} disabled={copyState === 'copying' || !recoveryLoaded} onClick={() => void copyAll()}>Copy rendered</button><span className="separator" /><select aria-label="PDF page size" value={preferences.pageSize} onChange={event => setPreferences(value => ({ ...value, pageSize: event.target.value as 'A4' | 'Letter' }))}><option>Letter</option><option>A4</option></select><button className="secondary" aria-label="Export PDF" title="Export PDF · Ctrl+Shift+P" disabled={exporting || !recoveryLoaded} onClick={() => void action.current('pdf')}>{exporting ? 'Exporting…' : 'Export PDF'}</button></header>
    <main className="workspace">
      <section className="pane editor-pane" style={{ flexBasis: `calc(${split}% - 8px)` }}><div className="pane-heading"><span><b className="pane-dot" /> MARKDOWN</span><span className="pane-meta">SOURCE</span></div><div className="editor-host" ref={editorHost} /></section>
      <div className="splitter" role="separator" aria-label="Resize editor and preview" aria-orientation="vertical" aria-valuenow={split} aria-valuemin={25} aria-valuemax={75} tabIndex={0}
        onDoubleClick={() => setSplit(50)}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
        onPointerMove={event => { if (event.buttons !== 1) return; const bounds = event.currentTarget.parentElement!.getBoundingClientRect(); setSplit(Math.min(75, Math.max(25, (event.clientX - bounds.left) / bounds.width * 100))); }}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) { event.preventDefault(); setSplit(value => event.key === 'Home' ? 50 : Math.max(25, Math.min(75, value + (event.key === 'ArrowRight' ? 2 : -2)))); } }}><span /></div>
      <section className="pane preview-pane"><div className="pane-heading"><span><b className="pane-dot green" /> PREVIEW</span><label className="sync-toggle"><input type="checkbox" checked={linked} onChange={event => { syncEnabled.current = event.target.checked; setLinked(event.target.checked); if (event.target.checked) sync.current?.refresh(); }} /> Sync scroll</label><span className="pane-meta">{rendering ? 'RENDERING…' : 'LIVE'}</span></div><div ref={preview} className="preview-scroll" tabIndex={0} data-testid="preview" data-render-state={rendering ? 'rendering' : 'ready'} aria-label="Rendered preview" aria-busy={rendering}><article className="document" dangerouslySetInnerHTML={{ __html: document.html }} /></div></section>
    </main>
    <footer><span role="status" aria-live="polite" title={status}><i className="status-dot" /> {rendering ? 'Rendering equations…' : status}</span><span>{source.trim() ? source.trim().split(/\s+/).length : 0} words <em>·</em> {source.length.toLocaleString()} characters <em>·</em> UTF-8</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
