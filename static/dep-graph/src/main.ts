import { invoke, router, view } from "@forge/bridge";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import type { NodeSingular } from "cytoscape";
import { makeGraph } from "./jira";

cytoscape.use(dagre);

const token = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

const statusTokens: Record<string, [string, string]> = {
  "blue-gray": ["--ds-background-accent-gray-subtler", "#dfe1e6"],
  yellow: ["--ds-background-accent-blue-subtler", "#cce0ff"],
  green: ["--ds-background-accent-green-subtler", "#baf3db"],
};

const nodeLabel = (node: NodeSingular): string =>
  [
    `${node.data("flagged") ? "🚩 " : ""}${node.id()}`,
    node.data("status"),
  ]
    .filter(Boolean)
    .join("\n");

const buildStyle = (): cytoscape.StylesheetJson => {
  const text = token("--ds-text", "#172b4d");
  const border = token("--ds-border-bold", "#8590a2");
  const statusColours = Object.fromEntries(
    Object.entries(statusTokens).map(([k, [name, fallback]]) => [
      k,
      token(name, fallback),
    ]),
  );
  const defaultColour = token("--ds-surface-sunken", "#f4f5f7");

  return [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        label: nodeLabel,
        "text-wrap": "wrap",
        "text-valign": "center",
        "font-size": 12,
        color: text,
        width: "label",
        height: "label",
        padding: "10px",
        "background-color": (n: NodeSingular) =>
          statusColours[n.data("colour")] ?? defaultColour,
        "border-width": 1,
        "border-color": border,
      },
    },
    {
      selector: "node[?isRoot]",
      style: {
        "border-width": 2,
        "border-color": token("--ds-border-danger", "#e2483d"),
        "border-style": "dashed",
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": border,
        "target-arrow-color": border,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": 10,
        color: token("--ds-text-subtle", "#44546f"),
        "text-background-color": token("--ds-surface", "#ffffff"),
        "text-background-opacity": 1,
        "text-rotation": "autorotate",
      },
    },
  ];
};

const container = document.getElementById("graph")!;

Promise.all([invoke("getKey"), view.theme.enable()]).then(async ([issueKey]) => {
  const elements = await makeGraph(issueKey as string);
  container.textContent = "";
  container.classList.remove("loading");

  const graph = cytoscape({
    container,
    elements,
    wheelSensitivity: 0.3,
    style: buildStyle(),
    layout: {
      name: "dagre",
      rankDir: "TB",
      nodeSep: 40,
      rankSep: 80,
    } as cytoscape.LayoutOptions,
  });

  new MutationObserver(() => graph.style(buildStyle())).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ["data-color-mode"] },
  );

  graph.on("tap", "node", (e) => router.open(`/browse/${e.target.id()}`));
  graph.on("mouseover", "node", () => (container.style.cursor = "pointer"));
  graph.on("mouseout", "node", () => (container.style.cursor = "default"));
});
