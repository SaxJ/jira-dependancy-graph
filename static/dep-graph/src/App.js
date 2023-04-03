import React, { useEffect, useState } from 'react';
import { invoke, requestJira } from '@forge/bridge';
import mermaid from 'mermaid';

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

const makeGraphMermaid = async (rootKey) => {
  const {allLinks, allIssues } = await traverseIssues(rootKey);
  const {baseUrl} = await (await requestJira('/rest/api/3/serverInfo')).json();

  const nodes = allIssues.map(i => `${i.replace('-', '')}[${i}]`);
  const actions = allIssues.map(i => `click ${i.replace('-', '')} "${baseUrl}/browse/${i}"`)
  const links = allLinks.filter(l => l.dir === 'out').map((link) => {
    const arrow = link.dir === 'in' ? '<--' : '-->';
    return `${link.root.replace('-', '')} ${arrow}|${link.type}| ${link.other.replace('-', '')}`;
  });

  const graphList = [...nodes, ...actions, ...links];
  const graph = `
  flowchart TD
  ${graphList.join('\n')}
  `;
  const {svg} = await mermaid.render('graphz', graph);
  return svg;
}

function App() {
  const [key, setKey] = useState(null);
  const [graph, setGraph] = useState(null);

  useEffect(() => {
    invoke('getKey', { example: 'my-invoke-variable' }).then(setKey);
  }, []);

  useEffect(() => {
    makeGraphMermaid(key).then(setGraph);
  }, [key])

  return (
    <div>
      {graph ? <div dangerouslySetInnerHTML={{__html: graph}}></div> : <div className='rotating'></div>}
    </div>
  );
}

export default App;
