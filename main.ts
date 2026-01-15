import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownView,
  ToggleComponent,
} from "obsidian";
import { RangeSetBuilder, StateField, EditorState } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";

interface H2WordCountSettings {
  showWords: boolean;
  showChars: boolean;
  showPage: boolean;
  showReadingTime: boolean;
  showH1: boolean;
  showH2: boolean;
  showH3: boolean;
}

const DEFAULT_SETTINGS: H2WordCountSettings = {
  showWords: true,
  showChars: true,
  showPage: false,
  showReadingTime: false,
  showH1: false,
  showH2: true,
  showH3: false,
};

// Global reference to settings
let currentSettings: H2WordCountSettings = Object.assign({}, DEFAULT_SETTINGS);

export default class H2WordCountPlugin extends Plugin {
  settings: H2WordCountSettings;

  async onload() {
    await this.loadSettings();
    currentSettings = this.settings;

    this.registerEditorExtension(h2WordCountField);
    this.addSettingTab(new H2WordCountSettingTab(this.app, this));
  }

  onunload() {
    // Plugin cleanup is handled by Obsidian
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    currentSettings = this.settings;
    // Trigger update
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as MarkdownView;
        // Access CodeMirror 6 EditorView through Obsidian's internal editor structure
        const editorWithCM = view.editor as { cm?: EditorView };
        if (editorWithCM.cm instanceof EditorView) {
          editorWithCM.cm.dispatch();
        }
      }
    });
  }
}

class H2WordCountSettingTab extends PluginSettingTab {
  plugin: H2WordCountPlugin;

  constructor(app: App, plugin: H2WordCountPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Display").setHeading();

    new Setting(containerEl)
      .setName("Words")
      .setDesc("Show word count")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.showWords)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showWords = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Characters")
      .setDesc("Show character count")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.showChars)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showChars = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Pages")
      .setDesc("Show page count (300 words per page)")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.showPage)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showPage = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reading time")
      .setDesc("Show estimated reading time")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.showReadingTime)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showReadingTime = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Header levels").setHeading();

    new Setting(containerEl)
      .setName("Level 1 headers")
      .setDesc("Show word count for level 1 headers")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.showH1)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showH1 = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Level 2 headers")
      .setDesc("Show word count for level 2 headers")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.showH2)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showH2 = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Level 3 headers")
      .setDesc("Show word count for level 3 headers")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.showH3)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showH3 = value;
            await this.plugin.saveSettings();
          })
      );

    const donationDiv = containerEl.createDiv({
      cls: "h2-word-count-settings-support",
    });

    donationDiv.createEl("p", {
      text: "If this plugin adds value for you and you would like to help support continued development, please use the buttons below:",
    });

    const link = donationDiv.createEl("a", {
      href: "https://buymeacoffee.com/ideo2004c",
    });

    const img = link.createEl("img", { cls: "h2-word-count-donation-img" });
    img.src = "https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png";
    img.alt = "Buy Me A Coffee";
  }
}

class WordCountWidget extends WidgetType {
  constructor(private wordCount: number, private charCount: number) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.addClass("h2-word-count-widget");

    const parts: string[] = [];

    if (currentSettings.showWords) {
      parts.push(`${this.formatNumber(this.wordCount)} words`);
    }
    if (currentSettings.showChars) {
      parts.push(`${this.formatNumber(this.charCount)} characters`);
    }
    if (currentSettings.showPage) {
      const pages = Math.ceil(this.wordCount / 300);
      parts.push(`${this.formatNumber(pages)} pages`);
    }
    if (currentSettings.showReadingTime) {
      const minutes = Math.ceil(this.wordCount / 275);
      parts.push(`${minutes} min read`);
    }

    if (parts.length > 0) {
      span.textContent = `(${parts.join(" / ")})`;
    } else {
      span.addClass("h2-word-count-hidden");
    }

    return span;
  }

  formatNumber(num: number): string {
    return num.toLocaleString();
  }
}

const h2WordCountField = StateField.define<DecorationSet>({
  create(state) {
    return computeWordCounts(state);
  },
  update(oldState, transaction) {
    if (transaction.docChanged || transaction.selection) {
      // Recompute on doc change or selection (for settings updates via dispatch)
      return computeWordCounts(transaction.state);
    }
    return oldState;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function computeWordCounts(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  const lines = doc.lines;

  // Active headers for H1, H2, H3 (indices 1, 2, 3)
  const activeHeaders: ({
    from: number;
    to: number;
    linePos: number;
  } | null)[] = [null, null, null, null];
  const decorationsBuffer: { pos: number; widget: Decoration }[] = [];

  const closeHeader = (level: number, endOffset: number) => {
    const active = activeHeaders[level];
    if (!active) return;

    const contentStart = Math.min(doc.length, active.to + 1);
    const contentEnd = Math.min(doc.length, endOffset);

    let words = 0;
    let chars = 0;

    if (contentStart < contentEnd) {
      const sectionText = doc.sliceString(contentStart, contentEnd);
      words = countWords(sectionText);
      chars = sectionText.length;
    }

    const widget = Decoration.widget({
      widget: new WordCountWidget(words, chars),
      side: 1,
    });

    decorationsBuffer.push({ pos: active.linePos, widget: widget });
    activeHeaders[level] = null;
  };

  for (let i = 1; i <= lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    let level = 0;
    if (text.startsWith("# ")) level = 1;
    else if (text.startsWith("## ")) level = 2;
    else if (text.startsWith("### ")) level = 3;

    if (level > 0) {
      // Close any open headers of same or lower rank (higher level number = lower rank, but here we mean:
      // H1 closes H1, H2, H3
      // H2 closes H2, H3
      // H3 closes H3
      for (let l = 3; l >= level; l--) {
        if (activeHeaders[l]) {
          closeHeader(l, line.from);
        }
      }

      // Open new header if enabled
      let enabled = false;
      if (level === 1) enabled = currentSettings.showH1;
      else if (level === 2) enabled = currentSettings.showH2;
      else if (level === 3) enabled = currentSettings.showH3;

      if (enabled) {
        activeHeaders[level] = {
          from: line.from,
          to: line.to,
          linePos: line.to,
        };
      }
    }
  }

  // Close all remaining open headers at end of doc
  for (let l = 1; l <= 3; l++) {
    if (activeHeaders[l]) {
      closeHeader(l, doc.length);
    }
  }

  decorationsBuffer.sort((a, b) => a.pos - b.pos);

  for (const d of decorationsBuffer) {
    builder.add(d.pos, d.pos, d.widget);
  }

  return builder.finish();
}

function countWords(str: string): number {
  let cjkCount = 0;
  const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g;

  const textWithoutCJK = str.replace(cjkRegex, () => {
    cjkCount++;
    return " ";
  });

  const englishWords = textWithoutCJK.match(/\S+/g);
  const enWordCount = englishWords ? englishWords.length : 0;

  return cjkCount + enWordCount;
}
