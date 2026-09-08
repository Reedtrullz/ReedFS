import { parse } from 'yaml';

export function validateWorkflowActions(workflows, requiredActions) {
  const failures = [];
  const found = new Set();
  const codeqlRefs = new Set();

  for (const [file, source] of Object.entries(workflows)) {
    try {
      const workflow = parse(source);
      if (!workflow?.jobs || typeof workflow.jobs !== 'object' || Array.isArray(workflow.jobs)) {
        throw new Error('workflow must define jobs');
      }
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error(`invalid job: ${jobName}`);
        if (job.steps !== undefined && !Array.isArray(job.steps)) throw new Error(`invalid steps: ${jobName}`);
        for (const entry of [job, ...(job.steps ?? [])]) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`invalid step: ${jobName}`);
          if (!Object.hasOwn(entry, 'uses')) continue;
          const match = typeof entry.uses === 'string' && entry.uses.match(/^([\w.-]+\/[\w.-]+(?:\/[\w.-]+)*)@([a-f0-9]{40})$/i);
          if (!match) {
            failures.push(`${file}/${jobName}: action must use a full commit SHA: ${String(entry.uses)}`);
            continue;
          }
          found.add(match[1].toLowerCase());
          if (match[1].toLowerCase().startsWith('github/codeql-action/')) codeqlRefs.add(match[2].toLowerCase());
        }
      }
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  for (const action of requiredActions) {
    if (!found.has(action)) failures.push(`missing required action: ${action}`);
  }
  if (codeqlRefs.size > 1) failures.push('CodeQL actions must use the same SHA');
  return failures;
}
