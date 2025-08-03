import cytoscape from "cytoscape";
import "./style.css";

const graph = cytoscape({
  container: document.getElementById("graph"),
  elements: [
    { data: { id: "a" } },
    { data: { id: "b" } },

    // edges
    {
      data: { id: "ab", source: "a", target: "b" },
    },
  ],
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
      },
    },
  ],
  layout: { name: "grid" },
});

graph.forceRender();
