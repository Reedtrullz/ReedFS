import { describe, expect, it } from 'vitest';
import { validateWorkflowActions } from '../workflow-actions.mjs';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const workflow = (steps) => `jobs:\n  test:\n    steps:\n${steps.map((step) => `      - ${step}`).join('\n')}\n`;
const validate = (source, required = ['actions/checkout']) => validateWorkflowActions({ 'ci.yml': source }, required);

describe('workflow action pins', () => {
  it('accepts new full SHAs, quoted references and trailing comments', () => {
    expect(validate(workflow([`uses: "actions/checkout@${otherSha}" # updated`]))).toEqual([]);
  });

  it.each(['v7', 'main', 'abc123', `${sha}extra`, '${{ inputs.ref }}'])('rejects mutable or invalid reference %s even beside a valid occurrence', (ref) => {
    expect(validate(workflow([`uses: actions/checkout@${sha}`, `uses: actions/checkout@${ref}`]))).not.toEqual([]);
  });

  it('does not count comments or shell text as required actions', () => {
    expect(validate(workflow([`run: |\n          # uses: actions/checkout@${sha}`]))).toContain('missing required action: actions/checkout');
  });

  it('checks reusable workflows and every supplied workflow', () => {
    expect(validateWorkflowActions({
      'ci.yml': workflow([`uses: actions/checkout@${sha}`]),
      'other.yaml': 'jobs:\n  reusable:\n    uses: owner/repo/.github/workflows/build.yml@main\n',
    }, ['actions/checkout'])).not.toEqual([]);
  });

  it('requires matching CodeQL refs across all occurrences', () => {
    const pair = [`uses: github/codeql-action/init@${sha}`, `uses: github/codeql-action/analyze@${sha}`];
    const required = ['github/codeql-action/init', 'github/codeql-action/analyze'];
    expect(validate(workflow(pair), required)).toEqual([]);
    expect(validate(workflow([...pair, `uses: github/codeql-action/analyze@${otherSha}`]), required)).toContain('CodeQL actions must use the same SHA');
    expect(validate(workflow(pair.slice(0, 1)), required)).toContain('missing required action: github/codeql-action/analyze');
  });

  it('normalizes action identity before CodeQL consistency checks', () => {
    expect(validate(workflow([`uses: github/codeql-action/init@${sha}`, `uses: GitHub/CodeQL-Action/analyze@${otherSha}`]), [])).toContain('CodeQL actions must use the same SHA');
  });

  it.each(['jobs: [', 'jobs:\n  test:\n    steps:\n      - uses: false\n', 'jobs:\n  test:\n    steps:\n      - uses: actions/checkout@main\n        uses: actions/checkout@' + sha])('fails closed on invalid YAML or values', (source) => {
    expect(validate(source)).not.toEqual([]);
  });
});
