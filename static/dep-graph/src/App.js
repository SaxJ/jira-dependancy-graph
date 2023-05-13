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

const getEpicIssues = async (epicKey) => {
  const epicResponse = await requestJira(`/rest/api/3/search`, {
    body: `{"fields": ["key"], "jql": "parent = ${epicKey}"}`,
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }
  });
  const epic = await epicResponse.json();
  const issues = epic.issues;

  if (issues.length > 0) {
    return await traverseIssues(issues[0].key);
  } else {
    return {
      allLinks: [],
      allIssues: [],
    };
  }
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
    const {issuelinks} = issue.fields;

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

const startProcessing = async (key, isEpic) => {
  if (isEpic) {
    return await getEpicIssues(key);
  } else {
    return await traverseIssues(key);
  }
}

const makeGraphMermaid = async (rootKey) => {
  const isEpic = await issueIsEpic(rootKey);
  const traverseResult = await startProcessing(rootKey, isEpic);
  const {allLinks, allIssues} = traverseResult;

  const nodes = allIssues.map(i => `${i.key.replace('-', '_')}[${i.key}]`);
  const colours = allIssues.map(i => `style ${i.key.replace('-', '_')} fill:${statusToColour(i.status)}`);
  const links = allLinks.filter(l => l.dir === 'out').map((link) => {
    const arrow = link.dir === 'in' ? '<--' : '-->';
    return `${link.root.replace('-', '_')} ${arrow}|${link.type}| ${link.other.replace('-', '_')}`;
  });

  const graphList = [...nodes, ...colours, ...links];
  const graph = `
  flowchart TD
  ${graphList.join('\n')}
  `;
  const rendered = await mermaid.render('graphz', graph);
  return rendered;
}

const clickedGraph = (event) => {
  const issueName = event.target.textContent;
  const isIssueText = /[a-zA-Z]+-\d+/.test(issueName);
  if (issueName === null || issueName === '' || !isIssueText) {
    return;
  }

  router.open(`/browse/${issueName}`);
}

const statusToColour = (name) => {
  switch (name) {
    case 'To Do':
      return '#b6b6b7';
    case 'In Progress':
      return '#c8cfd8';
    case 'Done':
      return '#b2cac0';
    default:
      return hashStringToColour(name);
  }
};

const hashStringToColour = function(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    var colour = '#';
    for (var i = 0; i < 3; i++) {
        var value = (hash >> (i * 8)) & 0xFF;
        colour += ('00' + value.toString(16)).substr(-2);
    }
    return colour;
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

  const {svg} = graph ?? {};
  const graphDiv = graph ? (<div dangerouslySetInnerHTML={{__html: svg}} onClick={clickedGraph}></div>) :  (<div className='rotating'></div>);
  return (
    <div>
      {graphDiv}
    </div>
  );
}

export default App;
