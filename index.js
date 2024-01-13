const fs = require("fs");
const minimist = require("minimist");
const YAML = require('yaml');
const path = require('path');
const util = require('util')
const graphviz = require('graphviz');
async function main() {
  let argv = minimist(process.argv.slice(1));
  if (argv.i === undefined) {
    console.error("No input workflows directory specified")
    return
  }
  let workflows = await readWorkflows(argv.i)
  let graph = graphviz.digraph("G");
  graph.set("layout", "dot")
  graph.set("rankdir", "LR")
  graph.set("compound", "true")
  graph.set("ranksep", 3)
  
  // Adding workflow
  workflows.forEach(workflow => {
    //console.log(JSON.stringify(w.filename))
    workflow.clusterId = "cluster_".concat(normalizeName(workflow.filename))
    graph.addCluster(workflow.clusterId)
    graph.getCluster(workflow.clusterId).set("style", "filled")
    graph.getCluster(workflow.clusterId).set(`label`, `${workflow.name}\n(${workflow.filename})`)
  })
  // Adding triggers
  workflows.forEach(workflow => {
    var triggers = []
    for (const on in workflow.on) {
      let triggerId = normalizeName(workflow.filename.concat(on))
      triggers.push(triggerId)
      graph.getCluster(workflow.clusterId)
        .addNode(triggerId, { label: on, shape: "diamond", style: "filled", fillcolor: "lightyellow", width: 3 })
    }
    for (let i = 0; i < triggers.length - 1; i++) {
      let first = normalizeName(triggers[i])
      let next = normalizeName(triggers[i + 1])
      //graph.getCluster(workflow.clusterId)
      //  .addEdge(first, next, { style: "invis" })
    }
  })
  // Adding jobs
  workflows.forEach(workflow => {
    Object.entries(workflow.jobs).forEach(([jobName, job]) => {
      job.nodeId = normalizeName(workflow.filename.concat(jobName))
      let jobLabel = ""
      if (job.name === undefined) {
        jobLabel = jobName
      } else {
        jobLabel = job.name
      }
      let reusedWorkflow = getReusedWorkflow(job)
      if (reusedWorkflow === null) {
        jobLabel
      } else {
        jobLabel = jobLabel + "\n(" + reusedWorkflow + ")"
      }
      graph.getCluster(workflow.clusterId)
        .addNode(job.nodeId, { label: jobLabel, width: 3 })
    })
  })
  // Adding dependencies
  workflows.forEach(workflow => {
    Object.entries(workflow.jobs).forEach(([jobName, job]) => {
      let usedWorkflowName = getReusedWorkflow(job);
      if (usedWorkflowName !== null) {
        workflows.filter((w2) => w2.filename === usedWorkflowName)
          .forEach((w2) => {
            let firstJob = Object.entries(w2.jobs)[0]
            let triggerId = normalizeName(w2.filename.concat("workflow_call"))
            graph.addEdge(job.nodeId, triggerId, { style: "dashed", constraint: true, lhead: w2.clusterId })
            graph.getNode(job.nodeId).set("style", "dashed")
          })
      }
    })
  })
  // Adding jobs dependencies
  workflows.forEach(workflow => {
    Object.entries(workflow.jobs).forEach(([jobName, job]) => {
      let needs = []
      if (job.needs !== undefined) {

        if (typeof job.needs === 'string') {
          needs.push(job.needs)
        } else {
          needs = job.needs
        }
        needs.forEach(need => {
          let needJob = workflow.jobs[need].nodeId
          graph.addEdge(needJob, job.nodeId)
        })
      }
    })
  })
  console.log(graph.to_dot());
}

function normalizeName(name) {
  return name.replaceAll(".", "_").replaceAll("-", "_")
}

function getReusedWorkflow(job) {
  if (job.uses !== undefined && job.uses.includes("./")) {
    let idx = job.uses.lastIndexOf('/');
    let usedWorkflowName = job.uses.substring(idx + 1);
    return usedWorkflowName
  } else {
    return null
  }
}
async function readWorkflows(dir) {
  const files = fs.readdirSync(dir);
  const workflows = []
  for (let file of files) {
    if (path.extname(path.join(dir, file)) === ".yml") {
      const fileData = fs.readFileSync(path.join(dir, file)).toString();
      const workflowYaml = YAML.parse(fileData)
      workflowYaml.filename = file
      workflows.push(workflowYaml)
    }
  }
  return workflows
}

main()