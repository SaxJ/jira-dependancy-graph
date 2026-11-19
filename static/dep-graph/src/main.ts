import { invoke, router } from "@forge/bridge";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import type { NodeSingular } from "cytoscape";
import { makeGraph } from "./jira";

cytoscape.use(dagre);

const statusColours: Record<string, string> = {
  "blue-gray": "#dfe1e6",
  yellow: "#cce0ff",
  green: "#baf3db",
};

const nodeLabel = (node: NodeSingular): string =>
  [
    `${node.data("flagged") ? "🚩 " : ""}${node.id()}`,
    node.data("status"),
  ]
    .filter(Boolean)
    .join("\n");

const container = document.getElementById("graph")!;

invoke("getKey").then(async (issueKey) => {
  const elements = await makeGraph(issueKey as string);
  container.textContent = "";
  container.classList.remove("loading");

  const graph = cytoscape({
    container,
    elements,
    wheelSensitivity: 0.3,
    style: [
      {
        selector: "node",
        style: {
          shape: "round-rectangle",
          label: nodeLabel,
          "text-wrap": "wrap",
          "text-valign": "center",
          "font-size": 12,
          color: "#172b4d",
          width: "label",
          height: "label",
          padding: "10px",
          "background-color": (n: NodeSingular) =>
            statusColours[n.data("colour")] ?? "#f4f5f7",
          "border-width": 1,
          "border-color": "#8590a2",
        },
      },
      {
        selector: "node[?isRoot]",
        style: {
          "border-width": 2,
          "border-color": "#e2483d",
          "border-style": "dashed",
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": "#8590a2",
          "target-arrow-color": "#8590a2",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
          "font-size": 10,
          color: "#44546f",
          "text-background-color": "#ffffff",
          "text-background-opacity": 1,
          "text-rotation": "autorotate",
        },
      },
    ],
    layout: {
      name: "dagre",
      rankDir: "TB",
      nodeSep: 40,
      rankSep: 80,
    } as cytoscape.LayoutOptions,
  });

  graph.on("tap", "node", (e) => router.open(`/browse/${e.target.id()}`));
  graph.on("mouseover", "node", () => (container.style.cursor = "pointer"));
  graph.on("mouseout", "node", () => (container.style.cursor = "default"));
});
