import { LoomSettings, NoteState } from "./common";
import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import { Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  WidgetType,
} from "@codemirror/view";
const dialog = require("electron").remote.dialog;

export class LoomView extends ItemView {
  getNoteState: () => NoteState | null;
  getSettings: () => LoomSettings;

  constructor(
    leaf: WorkspaceLeaf,
	getNoteState: () => NoteState | null,
	getSettings: () => LoomSettings
  ) {
    super(leaf);

	this.getNoteState = getNoteState;
	this.getSettings = getSettings;
  }

  async onOpen() {
    this.render();
  }

  render() {
    const state = this.getNoteState();
	const settings = this.getSettings();

	const scroll = this.containerEl.scrollTop;

	this.containerEl.empty();
	this.containerEl.addClass("loom__view");

	this.renderNavButtons(settings);
	const container = this.containerEl.createDiv({ cls: "outline" });
	if (settings.showExport) this.renderAltExportInterface(container);
	if (settings.showSettings) this.renderSettings(container, settings);

	if (!state) {
      container.createDiv({ cls: "pane-empty", text: "No note selected." });
	  return;
	}
	this.renderBookmarks(container, state);
	this.renderTree(container, state);

	this.containerEl.scrollTop = scroll;
  }

  renderNavButtons(settings: LoomSettings) {
    const navButtonsContainer = this.containerEl.createDiv({ cls: "nav-buttons-container loom__nav-buttons" });

    // buttons to toggle 1) settings 2) node borders in the editor

    const settingNavButton = (
      setting: string,
      value: boolean,
      icon: string,
      label: string
    ) => {
      const button = navButtonsContainer.createDiv({
        cls: `clickable-icon nav-action-button${value ? " is-active" : ""}`,
        attr: { "aria-label": label },
      });
      setIcon(button, icon);
      button.addEventListener("click", () =>
        this.app.workspace.trigger("loom:set-setting", setting, !value)
      );
    };

    settingNavButton(
      "showSettings",
      settings.showSettings,
      "settings",
      "Show settings"
    );
    settingNavButton(
      "showNodeBorders",
      settings.showNodeBorders,
      "separator-vertical",
      "Show node borders in the editor"
    );

	// the import button
	
	const importInput = navButtonsContainer.createEl("input", {
	  cls: "hidden",
	  attr: { type: "file", id: "loom__import-input" },
	});

    const importNavButton = navButtonsContainer.createEl("label", {
      cls: "clickable-icon nav-action-button",
      attr: { "aria-label": "Import JSON", for: "loom__import-input" },
    });
	setIcon(importNavButton, "import");
	
	importInput.addEventListener("change", () => {
	  // @ts-expect-error
	  const path = importInput.files?.[0].path;
	  if (path) this.app.workspace.trigger("loom:import", path);
	});

	// the export button
	
	const exportNavButton = navButtonsContainer.createDiv({
	  cls: `clickable-icon nav-action-button${settings.showExport ? " is-active" : ""}`,
	  attr: { "aria-label": "Export to JSON" },
	});
	setIcon(exportNavButton, "download");

	exportNavButton.addEventListener("click", (event) => {
	  if (event.shiftKey) {
	    this.app.workspace.trigger("loom:set-setting", "showExport", !settings.showExport);
		return;
	  }
	  dialog
	    .showSaveDialog({ title: "Export to JSON", filters: [{ extensions: ["json"] }] })
		.then((result: any) => {
		  if (result && result.filePath)
		    this.app.workspace.trigger("loom:export", result.filePath);
		});
	});
  }

  renderAltExportInterface(container: HTMLElement) {
    const exportContainer = container.createDiv({ cls: "loom__alt-export-field" });
	const exportInput = exportContainer.createEl("input", {
	  attr: { type: "text", placeholder: "Path to export to" },
	});
	const exportButton = exportContainer.createEl("button", {});
	setIcon(exportButton, "download");

	exportButton.addEventListener("click", () => {
	  if (exportInput.value) this.app.workspace.trigger("loom:export", exportInput.value);
	});
  }

  renderSettings(container: HTMLElement, settings: LoomSettings) {
    const settingsContainer = container.createDiv({ cls: "loom__settings" });

	// provider dropdown
	
	const providerContainer = settingsContainer.createDiv({ cls: "loom__setting" });
	providerContainer.createEl("label", { text: "Provider" });
	const providerDropdown = providerContainer.createEl("select");

	const providers = [
	  { label: "OpenAI code-davinci-002 proxy", value: "ocp" },
	  { label: "Cohere", value: "cohere" },
	  { label: "TextSynth", value: "textsynth" },
	  { label: "OpenAI", value: "openai" },
	  { label: "OpenAI (Chat)", value: "openai-chat" },
	  { label: "Azure", value: "azure" },
	  { label: "Azure (Chat)", value: "azure-chat" },
	];
	providers.forEach((provider) =>
	  providerDropdown.createEl("option", {
        text: provider.label,
		attr: {
		  value: provider.value,
		  selected: provider.value === settings.provider ? "selected" : null,
		},
	  })
	);

	providerDropdown.addEventListener("change", () =>
	  this.app.workspace.trigger("loom:set-setting", "provider", providerDropdown.value)
	);

	// other settings
	
	const setting = (
	  label: string,
	  setting: string,
	  value: string,
	  type: "string" | "int" | "float"
	) => {
      const parsers = {
	    "string": (value: string) => value,
		"int": (value: string) => parseInt(value),
		"float": (value: string) => parseFloat(value),
	  };

      const settingContainer = settingsContainer.createDiv({ cls: "loom__setting" });
	  settingContainer.createEl("label", { text: label });
	  const settingInput = settingContainer.createEl("input", {
	    type: type === "string" ? "text" : "number", value
	  });
      settingInput.addEventListener("blur", () =>
	    this.app.workspace.trigger(
		  "loom:set-setting", setting, parsers[type](settingInput.value)
	    )
	  );
	}

	setting("Model", "model", settings.model, "string");
	setting("Length (in tokens)", "maxTokens", String(settings.maxTokens), "int");
	setting("Number of completions", "n", String(settings.n), "int");
	setting("Temperature", "temperature", String(settings.temperature), "float");
	setting("Top p", "topP", String(settings.topP), "float");
	setting("Frequency penalty", "frequencyPenalty", String(settings.frequencyPenalty), "float");
	setting("Presence penalty", "presencePenalty", String(settings.presencePenalty), "float");
  }

  renderBookmarks(container: HTMLElement, state: NoteState) {
    const bookmarks = Object.entries(state.nodes).filter(([, node]) => node.bookmarked);

    const bookmarksContainer = container.createDiv({ cls: "loom__bookmarks" });

	const bookmarksHeader = bookmarksContainer.createDiv({
	  cls: "tree-item-self loom__tree-header"
	});
    bookmarksHeader.createSpan({
	  cls: "tree-item-inner loom__tree-header-text", text: "Bookmarks"
	});
	bookmarksHeader.createSpan({
	  cls: "tree-item-flair-outer loom__bookmarks-count",
	  text: String(bookmarks.length)
	});

	for (const [id,] of bookmarks)
	  this.renderNode(bookmarksContainer, state, id, false);
  }

  renderTree(container: HTMLElement, state: NoteState) {
    const treeHeader = container.createDiv({
	  cls: "tree-item-self loom__tree-header"
	});
	treeHeader.createSpan({
	  cls: "tree-item-inner loom__tree-header-text",
	  text: state.hoisted.length > 0 ? "Hoisted node" : "All nodes"
	});

	if (state.hoisted.length > 0)
	  this.renderNode(container, state, state.hoisted[state.hoisted.length - 1], true);
    else {
      const rootIds = Object.entries(state.nodes)
	    .filter(([, node]) => node.parentId === null)
		.map(([id]) => id);
	  for (const rootId of rootIds)
		this.renderNode(container, state, rootId, true);
	}
  }

  renderNode(
	container: HTMLElement,
	state: NoteState,
	id: string,
	inTree: boolean
  ) {
	const node = state.nodes[id];

	const branchContainer = container.createDiv({});

    const nodeContainer = branchContainer.createDiv({
	  cls: "is-clickable outgoing-link-item tree-item-self loom__node",
	  attr: { id: inTree ? `loom__node-${id}` : null },
	});
	if (id === state.current) nodeContainer.addClass("is-active");
	if (node.unread) nodeContainer.addClass("loom__node-unread");

	const children = Object.entries(state.nodes)
	  .filter(([, node]) => node.parentId === id)
	  .map(([id]) => id);

	// if the node has children, add an expand/collapse button

	if (inTree && children.length > 0) {
	  const collapseButton = nodeContainer.createDiv({
		cls: "collapse-icon loom__collapse-button"
	  });
	  if (node.collapsed) collapseButton.addClass("loom__is-collapsed");
	  setIcon(collapseButton, "right-triangle");

	  collapseButton.addEventListener("click", () =>
	    this.app.workspace.trigger("loom:toggle-collapse", id)
	  );
	}
	
	// if the node is bookmarked, add a bookmark icon
	
	if (node.bookmarked) {
	  const bookmarkIcon = nodeContainer.createDiv({ cls: "loom__node-bookmark-icon" });
	  setIcon(bookmarkIcon, "bookmark");
	}
	
	// if the node is unread, add an unread indicator
	
    if (node.unread) nodeContainer.createDiv({ cls: "loom__node-unread-indicator" });
	
	// add the node's text
	
	const nodeText = nodeContainer.createEl(node.text.trim() ? "span" : "em", {
      cls: "tree-item-inner loom__node-text",
	  text: node.text.trim() || "No text",
	});
	nodeText.addEventListener("click", () =>
	  this.app.workspace.trigger("loom:switch-to", id)
	);

	// define `showMenu`,
	// which is triggered by pressing the menu button or right-clicking the node

	const rootNodes = Object.entries(state.nodes)
	  .filter(([, node]) => node.parentId === null)
	const deletable = rootNodes.length !== 1 || rootNodes[0][0] !== id;
	
	const showMenu = () => {
      const menu = new Menu();

	  const menuItem = (name: string, icon: string, callback: () => void) =>
	    menu.addItem((item) => {
          item.setTitle(name);
		  item.setIcon(icon);
		  item.onClick(callback);
		});
	  
	  const zeroArgMenuItem = (name: string, icon: string, event: string) =>
	    menuItem(name, icon, () => this.app.workspace.trigger(event));
	  const selfArgMenuItem = (name: string, icon: string, event: string) =>
	    menuItem(name, icon, () => this.app.workspace.trigger(event, id));
	  
	  if (state.hoisted[state.hoisted.length - 1] === id)
	    zeroArgMenuItem("Unhoist", "arrow-down", "loom:unhoist");
	  else
	    selfArgMenuItem("Hoist", "arrow-up", "loom:hoist");
	  
	  if (node.bookmarked)
	    selfArgMenuItem("Remove bookmark", "bookmark", "loom:toggle-bookmark");
	  else
	    selfArgMenuItem("Bookmark", "bookmark-minus", "loom:toggle-bookmark");

	  menu.addSeparator();
	  selfArgMenuItem("Create child", "plus", "loom:create-child");
	  selfArgMenuItem("Create sibling", "list-plus", "loom:create-sibling");

	  menu.addSeparator();
	  selfArgMenuItem("Delete all children", "x", "loom:clear-children");
	  selfArgMenuItem("Delete all siblings", "list-x", "loom:clear-siblings");

	  if (node.parentId !== null) {
        menu.addSeparator();
		selfArgMenuItem("Merge with parent", "arrow-up-left", "loom:merge-with-parent");
	  }

      if (deletable) {
		menu.addSeparator();
		selfArgMenuItem("Delete", "trash", "loom:delete");
	  }
	  
	  const rect = nodeContainer.getBoundingClientRect();
	  menu.showAtPosition({ x: rect.right, y: rect.top });
	}

	nodeContainer.addEventListener("contextmenu", (event) => {
	  event.preventDefault();
	  showMenu();
	});

	// add buttons on hover
	
	const nodeButtonsContainer = nodeContainer.createDiv({
	  cls: "loom__node-buttons"
	});

	const button = (label: string, icon: string, callback: () => void) => {
	  const button_ = nodeButtonsContainer.createDiv({
		cls: "loom__node-button",
		attr: { "aria-label": label },
	  });
	  setIcon(button_, icon);
	  button_.addEventListener("click", callback);
	};

	button("Show menu", "menu", showMenu);

	if (state.hoisted[state.hoisted.length - 1] === id)
	  button("Unhoist", "arrow-down", () => this.app.workspace.trigger("loom:unhoist"));
    else button("Hoist", "arrow-up", () => this.app.workspace.trigger("loom:hoist", id));

	if (node.bookmarked)
	  button(
		"Remove bookmark",
		"bookmark-minus",
		() => this.app.workspace.trigger("loom:toggle-bookmark", id)
	  );
	else
	  button("Bookmark", "bookmark", () =>
		this.app.workspace.trigger("loom:toggle-bookmark", id)
	  );
	
	if (deletable)
	  button("Delete", "trash", () => this.app.workspace.trigger("loom:delete", id));
	
	// indicate if loom is currently generating children for this node

	if (inTree && state.generating === id) {
	  const generatingContainer = branchContainer.createDiv({
		cls: "loom__node-footer"
	  });
	  const generatingIcon = generatingContainer.createDiv({
		cls: "loom__node-generating-icon"
	  });
	  setIcon(generatingIcon, "loader-2");
	  generatingContainer.createSpan({
		cls: "loom__node-footer-text",
		text: "Generating..."
	  });
	}
	
	// if in a tree, and if the node isn't collapsed, render its children

	if (!inTree || node.collapsed) return;

	if (branchContainer.offsetWidth < 150) {
      if (children.length > 0) {
        const showMore = branchContainer.createDiv({
		  cls: "loom__node-footer loom__node-show-more"
		});
		setIcon(showMore, "arrow-up");
		showMore.createSpan({
		  cls: "loom__node-footer-text",
		  text: "Show more...",
		});

		showMore.addEventListener("click", () =>
		  this.app.workspace.trigger("loom:hoist", id)
		);
	  }

	  return;
	}

	const childrenContainer = branchContainer.createDiv({
	  cls: "loom__node-children"
	});
	for (const childId of children)
	  this.renderNode(childrenContainer, state, childId, true);
  }
 
  getViewType(): string {
    return "loom";
  }

  getDisplayText(): string {
    return "Loom";
  }

  getIcon(): string {
    return "network";
  }
}

export class LoomSiblingsView extends ItemView {
  getNoteState: () => NoteState | null;

  constructor(leaf: WorkspaceLeaf, getNoteState: () => NoteState | null) {
	super(leaf);
	this.getNoteState = getNoteState;
	this.render();
  }

  render() {
    const scroll = this.containerEl.scrollTop;

	this.containerEl.empty();
	this.containerEl.addClass("loom__view");
	const container = this.containerEl.createDiv({ cls: "outline" });

	const state = this.getNoteState();

	if (state === null) {
	  container.createDiv({
		cls: "pane-empty",
		text: "No note selected.",
	  });
	  return;
	}
	
	const parentId = state.nodes[state.current].parentId;
	const siblings = Object.entries(state.nodes).filter(
	  ([, node]) => node.parentId === parentId
	);

	let currentNodeContainer = null;
	for (const i in siblings) {
	  const [id, node] = siblings[i];

	  const nodeContainer = container.createDiv({
		cls: `loom__sibling${id === state.current ? " is-active" : ""}`,
	  });
	  if (parentId !== null)
		nodeContainer.createSpan({
          text: "…",
		  cls: "loom__sibling-ellipsis",
		});
	  nodeContainer.createSpan({ text: node.text.trim() });
	  nodeContainer.addEventListener("click", () =>
	    this.app.workspace.trigger("loom:switch-to", id)
	  );

	  if (parseInt(i) !== siblings.length - 1)
	    container.createEl("hr", { cls: "loom__sibling-separator" });

	  if (id === state.current) currentNodeContainer = nodeContainer;
	}

	this.containerEl.scrollTop = scroll;

	if (currentNodeContainer !== null)
	  currentNodeContainer.scrollIntoView({ block: "nearest" });
  }

  getViewType(): string {
	return "loom-siblings";
  }

  getDisplayText(): string {
	return "Siblings";
  }

  getIcon(): string {
	return "layout-list";
  }
}

export interface LoomEditorPluginState {
  ancestorLengths: [string, number][];
  showNodeBorders: boolean;
}

export class LoomEditorPlugin implements PluginValue {
  decorations: DecorationSet;
  state: LoomEditorPluginState;

  constructor() {
    this.decorations = Decoration.none;
	this.state = { ancestorLengths: [], showNodeBorders: false };
  }

  update() {
    let decorations: Range<Decoration>[] = [];

	const addRange = (from: number, to: number, id: string) => {
	  try {
	    const range = Decoration.mark({
          class: `loom__editor-node loom__editor-node-${id}`,
		}).range(from, to);
		decorations.push(range);
	  } catch (e) {
		// this happens if the range is empty. it's ok. it's fine,
	  }
	};

	const addBorder = (at: number) => {
	  const range = Decoration.widget({
		widget: new LoomNodeBorderWidget(),
		side: -1,
	  }).range(at, at);
	  decorations.push(range);
	};

	let i = 0;
	for (const [id, length] of this.state.ancestorLengths) {
	  addRange(i, i + length, id);
	  i += length;
	  if (this.state.showNodeBorders) addBorder(i);
	}

	this.decorations = Decoration.set(decorations);
  }
}

class LoomNodeBorderWidget extends WidgetType {
  toDOM() {
	const el = document.createElement("span");
	el.classList.add("loom__editor-node-border");
	return el;
  }

  eq() {
	return true;
  }
}

export const loomEditorPluginSpec: PluginSpec<LoomEditorPlugin> = {
  decorations: (plugin: LoomEditorPlugin) => plugin.decorations,
  eventHandlers: {
    mouseover: (event: MouseEvent, _view: EditorView) => {
      if (event.button !== 0) return false;

      const target = event.target as HTMLElement;
      if (!target.classList.contains("loom__editor-node")) return false;

      const className = target.classList[target.classList.length - 1];
      for (const el of [].slice.call(
        document.getElementsByClassName(className)
      ))
        el.classList.add("loom__editor-node-hover");

      return true;
    },
    mouseout: (event: MouseEvent, _view: EditorView) => {
      if (event.button !== 0) return false;

      const target = event.target as HTMLElement;
      if (!target.classList.contains("loom__editor-node")) return false;

      const className = target.classList[target.classList.length - 1];
      for (const el of [].slice.call(
        document.getElementsByClassName(className)
      ))
        el.classList.remove("loom__editor-node-hover");

      return true;
    },
    mousedown: (event: MouseEvent, _view: EditorView) => {
      if (event.button !== 0 || !event.shiftKey) return false;

      const target = event.target as HTMLElement;
      if (!target.classList.contains("loom__editor-node")) return false;

      // the second last element, since the last is `loom__editor-node-hover`
      const className = target.classList[target.classList.length - 2];
      const id = className.split("-").slice(2).join("-");
      app.workspace.trigger("loom:switch-to", id);

      return true;
    },
  },
};