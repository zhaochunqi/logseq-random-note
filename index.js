import "@logseq/libs";

const settingsTemplate = [
  {
    key: "keyboard",
    type: "string",
    default: "r n",
    description:
      'Type in the key or key combination you wish to use to toggle. If you want multiple key combinations, add a space or "+" between the keys ("r n" or "ctrl+r"). \n\rIMPORTANT: After changing the hotkey, you must restart Logseq to take effect.',
    title: "Keyboard Hotkey",
  },
  {
    key: "randomMode",
    type: "enum",
    default: "page",
    title: "Random Mode",
    description: "Page, card, tags, namespace, simple query, or advanced query",
    enumChoices: ["page", "card", "tags", "namespace", "simple-query", "query"],
    enumPicker: "radio",
  },
  {
    key: "includeJournals",
    type: "boolean",
    default: false,
    title: "Page mode",
    description: "Include Journals?",
  },
  {
    key: "randomTags",
    type: "string",
    default: "",
    title: "Tags mode",
    description: "Comma separated the tags. e.g. programing,design,sports",
  },
  {
    key: "advancedQuery",
    type: "string",
    default: "",
    title: "Query mode",
    inputAs: "textarea",
    description:
      'Your custom query. e.g. [:find (pull ?b [*]) :where [?b :block/refs ?bp] [?bp :block/name "book"]]',
  },
  {
    key: "simpleQuery",
    type: "string",
    default: "",
    title: "Simple Query mode",
    inputAs: "textarea",
    description: 'Your simple query. e.g. (page-property :type "book")',
  },
  {
    key: "namespace",
    type: "string",
    default: "",
    title: "Namespace mode",
    description: "Enter the namespace to use for random selection",
  },
  {
    key: "randomStepSize",
    type: "enum",
    default: "1",
    title: "Random walk step size.",
    description:
      "Random walk step size. Use it with caution. One shows in main area, others show in the right sidebar.",
    enumChoices: ["1", "3", "5", "7", "10"],
    enumPicker: "radio",
  },
];

logseq.useSettingsSchema(settingsTemplate);

async function openRandomNote() {
  const queryScript = getQueryScript();
  let stepSize = parseInt(logseq.settings.randomStepSize || 1);
  try {
    let pages;
    if (logseq.settings.randomMode === "namespace") {
      const namespace = logseq.settings.namespace;
      pages = await logseq.Editor.getPagesFromNamespace(namespace);
    } else if (logseq.settings.randomMode === "simple-query") {
      pages = await logseq.DB.q(queryScript);
    } else {
      const ret = await logseq.DB.datascriptQuery(queryScript);
      pages = ret?.flat();
    }

    for (let i = 0; i < pages.length; i++) {
      const block = pages[i];
      if (block["pre-block?"]) {
        pages[i] = await logseq.Editor.getPage(block.page.id);
      }
    }
    openRandomNoteInMain(pages);
    if (stepSize > 1) {
      openRandomNoteInSidebar(pages, stepSize - 1);
    }
  } catch (err) {
    logseq.UI.showMsg(
      err.message || "Maybe something wrong with the query or namespace",
      "error"
    );
    console.log(err);
  }
}

/**
 * open random note in main area.
 * @param {*} pages
 */
async function openRandomNoteInMain(pages) {
  if (pages && pages.length > 0) {
    const index = Math.floor(Math.random() * pages.length);
    const page = pages[index];
    if (page && page.name) {
      logseq.App.pushState("page", { name: page.name });
    } else if (page && page.page) {
      const blockInfo = (await logseq.Editor.getBlock(page.id)) || {
        uuid: "",
      };
      logseq.App.pushState("page", { name: blockInfo.uuid });
    }
  }
}

/**
 * open random notes in right sidebar.
 * @param {*} pages
 * @param {*} counts
 */
async function openRandomNoteInSidebar(pages, counts) {
  for (var i = 0; i < counts; i++) {
    const index = Math.floor(Math.random() * pages.length);
    const page = pages[index];
    logseq.Editor.openInRightSidebar(page.uuid);
  }
}

function getQueryScript() {
  const randomMode = logseq.settings.randomMode;
  const includeJournals = logseq.settings.includeJournals;
  const randomTags = logseq.settings.randomTags.split(",");
  const defaultQuery = `
  [:find (pull ?p [*])
    :where
    [_ :block/page ?p]]`;
  switch (randomMode) {
    case "page":
      if (includeJournals) {
        return `
        [:find (pull ?p [*])
          :where
          [_ :block/page ?p]]`;
      } else {
        return `
        [:find (pull ?p [*])
          :where
          [_ :block/page ?p]
          [?p :block/journal? false]]`;
      }
    case "tags":
      const tags = randomTags
        .map((item) => '"' + item.toLowerCase() + '"')
        .join(",");
      if (!logseq.settings.randomTags) {
        logseq.UI.showMsg("Random tags are required.", "warning");
      }
      return (
        `
      [:find (pull ?b [*])
        :where
        [?b :block/refs ?bp]
        [?bp :block/name ?name]
        [(contains? #{` +
        tags +
        `} ?name)]]
      `
      );
    case "card":
      return `
        [:find (pull ?b [*])
          :where
          [?b :block/refs ?bp]
          [?bp :block/name ?name]
          [(contains? #{"card"} ?name)]]
        `;
    case "simple-query":
      return logseq.settings.simpleQuery;
    case "query":
      return logseq.settings.advancedQuery;
    case "namespace":
      return null;
    default:
      console.log("unknown");
      return defaultQuery;
  }
}

async function getRandomNoteInfo() {
  const queryScript = getQueryScript();
  const ret = await logseq.DB.datascriptQuery(queryScript);
  const blocks = ret?.flat();
  if (blocks && blocks.length > 0) {
    const index = Math.floor(Math.random() * blocks.length);
    const randomNoteInfo = await getBlockReadableContent(blocks[index].uuid);
    console.log("randomNoteInfo=" + randomNoteInfo);
    return randomNoteInfo;
  }
  return "";
}

async function getBlockReadableContent(uid) {
  const blockInfo = await logseq.Editor.getBlock(uid);
  console.log(blockInfo);
  console.log("before replace =>", blockInfo?.content);
  const content =
    blockInfo?.content.split(/\n.*::/)[0].replace("/\n.*::/", "") || "";
  console.log("after replace =>", content);
  if (hasRefUuid(content)) {
    const parts = content.split("))");
    const childContent = await getBlockReadableContent(
      parts[0].replace("((", "")
    );
    return childContent + parts[1];
  }
  return content;
}

const hasRefUuid = (content) => {
  return !!content && content.indexOf("((") > -1 && content.indexOf("))") > -1;
};

let isRunning = false;
let intervalId = null;

async function handleRandomNote() {
  if (isRunning) {
    clearInterval(intervalId);
    isRunning = false;
  } else {
    isRunning = true;
    openRandomNote(); // Immediately open a random note
    intervalId = setInterval(() => {
      openRandomNote();
    }, 5000); // Adjust the interval as needed
  }
  registerRandomNoteToolbar(isRunning)
}

function registerRandomNoteToolbar(isRunning) {
  logseq.App.registerUIItem("toolbar", {
    key: "RandomNote",
    template: `
      <span class="logseq-random-note-toolbar">
        <a title="I'm Feeling Lucky(r n)" class="button" data-on-click="handleRandomNote">
          <i id="random-note-icon" class="ti ti-windmill ${isRunning ? ' rotate' : ''}"></i>
        </a>
      </span>
    `,
  });
}

function main() {
  logseq.provideModel({
    handleRandomNote,
  });

  logseq.provideStyle(`
       /* 旋转动画 */
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .rotate {
            display: inline-block; /* 确保动画应用于图标本身 */
            animation: rotate 5s linear infinite;
        }
        /* 悬停时暂停动画 */
        .rotate:hover {
            animation-play-state: paused;
        }
  `);

  registerRandomNoteToolbar(false); // Initially not running

  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note",
      label: "Random note => Let's go",
      keybinding: {
        mode: "non-editing",
        binding: logseq.settings.keyboard || "r n",
      },
    },
    () => {
      openRandomNote();
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note:page-mode",
      label: "Random note => page mode",
    },
    () => {
      logseq.updateSettings({ randomMode: "page" });
    }
  );
  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note:tags-mode",
      label: "Random note => tags mode",
    },
    () => {
      logseq.updateSettings({ randomMode: "tags" });
    }
  );
  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note:card-mode",
      label: "Random note => card mode",
    },
    () => {
      logseq.updateSettings({ randomMode: "card" });
    }
  );
  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note:query-mode",
      label: "Random note => query mode",
    },
    () => {
      logseq.updateSettings({ randomMode: "query" });
    }
  );
  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note:simple-query-mode",
      label: "Random note => simple query mode",
    },
    () => {
      logseq.updateSettings({ randomMode: "simple-query" });
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note:advanced-query-mode",
      label: "Random note => advanced query mode",
    },
    () => {
      logseq.updateSettings({ randomMode: "query" });
    }
  );
  logseq.App.registerCommandPalette(
    {
      key: "logseq-random-note:namespace-mode",
      label: "Random note => namespace mode",
    },
    () => {
      logseq.updateSettings({ randomMode: "namespace" });
    }
  );
}

logseq.ready(main).catch(console.error);
