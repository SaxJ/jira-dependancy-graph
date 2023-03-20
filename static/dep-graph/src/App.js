import React, { useEffect, useState } from 'react';
import { invoke, requestJira } from '@forge/bridge';


const parseLink = (root, link) => {
  return {
    type: link.type.name,
    dir: link.inwardIssue ? 'in' : 'out',
    root: root,
    other: link.inwardIssue ? link.inwardIssue.key : link.outwardIssue.key,
  };
}

const traverseIssues = async (rootKey) => {
  let queue = [rootKey];
  let links = [];
  let seen = {};
  while (queue.length > 0) {
    let currentKey = queue.pop();
    if (currentKey in seen) {
      continue;
    }

    seen[currentKey] = true;
    let issueResponse = null;
    try {
      issueResponse = await requestJira(`/rest/api/3/issue/${currentKey}?fields=key,issuelinks`);
    } catch (e) {
      console.log(e);
    }
    const issue = await issueResponse.json();
    const {issuelinks} = issue.fields;

    for (let l of issuelinks) {
      const parsed = parseLink(currentKey, l);
      links.push(parsed);
      queue.push(parsed.other);
    }
  }

  return {
    allLinks: links,
    allIssues: Object.keys(seen),
  };
}

const makeGraph = async (rootKey) => {
  const {allLinks, allIssues } = await traverseIssues(rootKey);
  const {baseUrl} = await (await requestJira('/rest/api/3/serverInfo')).json();

  const nodes = allIssues.map(i => `"${i}" [shape=box,href="${baseUrl}/browse/${i}",target="_blank"];`);
  const links = allLinks.filter(l => l.dir === 'out').map((link) => {
    const arrow = link.dir === 'in' ? '<-' : '->';
    return `"${link.root}"${arrow}"${link.other}" [label="${link.type}"];`;
  });

  const graphList = [...nodes, ...links];
  const graph = graphList.join('');
  const url = `https://quickchart.io/graphviz?format=svg&graph=digraph{${graph}}`
  console.log(`url => ${url}`)
  const imgResponse = await (await fetch(url)).text();
  return imgResponse;
  // return URL.createObjectURL(imgResponse);
}

function App() {
  const [key, setKey] = useState(null);
  const [graph, setGraph] = useState(null);

  useEffect(() => {
    invoke('getKey', { example: 'my-invoke-variable' }).then(setKey);
  }, []);

  useEffect(() => {
    makeGraph(key).then(setGraph);
  }, [key])

  return (
    <div>
      {graph ? <div dangerouslySetInnerHTML={{__html: graph}} /> : 'Loading...'}
    </div>
  );
}

export default App;
