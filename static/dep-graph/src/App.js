import React, { useEffect, useState } from 'react';
import { invoke, requestJira, router } from '@forge/bridge';
import mermaid from 'mermaid';

const parseLink = (root, link) => {
  return {
    type: link.type.name,
    dir: link.inwardIssue ? 'in' : 'out',
    root: root,
    other: link.inwardIssue ? link.inwardIssue.key : link.outwardIssue.key,
  };
}

const issueToNode = (issue, status) => {
  const key = issue.key;
  const nodeId = key.replace('-', '_');

  return `${nodeId}["${key}<br/><small>${status}</small>"]`;
}

const issueToLinks = (issue) => {
  const parentKey = issue.key;
  const parentId = parentKey.replace('-', '_');

  const linkObjects = issue.fields.issuelinks;
  const links = []
  for (const linkObject of linkObjects) {
    if (linkObject.inwardIssue) {
      continue;
    }
    const linkType = linkObject.type.name;
    const destination = linkObject.outwardIssue.key.replace('-', '_');

    links.push(`${parentId} -->|${linkType}| ${destination}`);
  }

  return links;
}

const compileGraphFromEpic = (issues) => {
  const nodes = [];
  const links = [];
  for (const issue of issues) {
    nodes.push(issueToNode(issue, issue.fields.status.name));
    const ls = issueToLinks(issue);
    for (const l of ls) {
      links.push(l);
    }
  }


  const graphList = [...nodes, ...links];
  const graph = `
  flowchart TD
  ${graphList.join('\n')}
  `;

  return graph;
}

const getEpicIssues = async (epicKey) => {
  const epicResponse = await requestJira(`/rest/api/3/search`, {
    body: `{"fields": ["key","issuelinks","status"], "jql": "parentEpic = ${epicKey} OR parent = ${epicKey}"}`,
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }
  });
  const epic = await epicResponse.json();
  const issues = epic.issues;

  return issues;
}

const issueIsEpic = async (key) => {
  const issueResponse = await requestJira(`/rest/api/3/issue/${key}?fields=issuetype`);
  const issue = await issueResponse.json();
  const typeName = issue.fields.issuetype.name;
  return typeName === "Epic";
}

const traverseIssues = async (rootKey) => {
  const queue = [rootKey];
  const links = [];
  const seen = {};
  while (queue.length > 0) {
    let currentKey = queue.pop();
    if (currentKey in seen) {
      continue;
    }

    let issueResponse = null;
    try {
      issueResponse = await requestJira(`/rest/api/3/issue/${currentKey}?fields=key,issuelinks,status`);
    } catch (e) {
      console.log(e);
    }
    const issue = await issueResponse.json();
    const { issuelinks } = issue.fields;

    seen[currentKey] = {
      key: currentKey,
      colour: issue.fields.status.statusCategory.colorName,
      status: issue.fields.status.name,
    };

    for (let l of issuelinks) {
      const parsed = parseLink(currentKey, l);
      links.push(parsed);
      queue.push(parsed.other);
    }
  }

  return {
    allLinks: links,
    allIssues: Object.values(seen),
  };
}

const makeGraphMermaid = async (rootKey) => {
  const isEpic = await issueIsEpic(rootKey);
  if (isEpic) {
    const issues = await getEpicIssues(rootKey);
    const graph = compileGraphFromEpic(issues);
    const rendered = await mermaid.render('graphz', graph);
    return rendered;
  }

  const traverseResult = await traverseIssues(rootKey);
  const { allLinks, allIssues } = traverseResult;

  const nodes = allIssues.map(i => issueToNode(i, i.status));
  const links = allLinks.filter(l => l.dir === 'out').map((link) => {
    const arrow = link.dir === 'in' ? '<--' : '-->';
    return `${link.root.replace('-', '_')} ${arrow}|${link.type}| ${link.other.replace('-', '_')}`;
  });

  const graphList = [...nodes, ...links];
  const graph = `
  flowchart TD
  ${graphList.join('\n')}
  style ${rootKey.replace('-', '_')} stroke:red,stroke-dasharray:5 5
  `;
  const rendered = await mermaid.render('graphz', graph);
  return rendered;
}

const clickedGraph = (event) => {
  const issueName = event.target.textContent;
  const isIssueText = /[a-zA-Z]+-\d+/.test(issueName);
  if (issueName === null || issueName === '' || !isIssueText || issueName.length > 10) {
    return;
  }

  router.open(`/browse/${issueName}`);
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

  const { svg } = graph ?? {};
  const graphDiv = graph ? (<div dangerouslySetInnerHTML={{ __html: svg }} onClick={clickedGraph}></div>) : (<div className='rotating'></div>);
  return (
    <div>
      {graphDiv}
    </div>
  );
}

export default App;
