import { invoke } from "@forge/bridge";
import cytoscape from "cytoscape";
import { makeGraph } from "./jira";

invoke("getKey").then(async (issueKey) => {
  const graphDefinition = await makeGraph(issueKey as string);
  console.log(graphDefinition);

  const graph = cytoscape({
    container: document.getElementById("graph"),
    elements: graphDefinition,
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#666",
          label: "data(id)",
        },
      },
      {
        selector: "edge",
        style: {
          width: 3,
          "line-color": "#ccc",
          "target-arrow-color": "#ccc",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
        },
      },
    ],
    layout: { name: "grid" },
  });
  graph.forceRender();
});
