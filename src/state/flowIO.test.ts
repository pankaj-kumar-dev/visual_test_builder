/**
 * Flow JSON import/export validation tests (Phase 1, HLD §16 "Malformed Flow
 * JSON (on Import)"). Uses the bundled registry so "known node type" checks
 * reflect the real, shipped command set.
 */

import { describe, expect, it } from 'vitest';
import { FlowImportError, parseFlowJson, serializeFlow } from './flowIO';
import type { FlowNode } from '../domain/types';

describe('parseFlowJson', () => {
  it('accepts a valid single-node flow', () => {
    const raw = JSON.stringify({ id: 'root', type: 'visit', props: { url: '/login' } });
    expect(parseFlowJson(raw)).toEqual({ id: 'root', type: 'visit', props: { url: '/login' } });
  });

  it('accepts a nested flow with children', () => {
    const raw = JSON.stringify({
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'case' },
          children: [{ id: 'click-1', type: 'click', props: { selector: '#go' } }],
        },
      ],
    });
    const flow = parseFlowJson(raw);
    expect(flow?.type).toBe('describe');
    expect(flow?.children?.[0].children?.[0]).toEqual({
      id: 'click-1',
      type: 'click',
      props: { selector: '#go' },
    });
  });

  it('defaults a node with no props to an empty props object (matches ADD_NODE)', () => {
    const raw = JSON.stringify({ id: 'root', type: 'visit' });
    expect(parseFlowJson(raw)).toEqual({ id: 'root', type: 'visit', props: {} });
  });

  it('"null" is a valid, empty flow', () => {
    expect(parseFlowJson('null')).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(() => parseFlowJson('{not json')).toThrow(FlowImportError);
  });

  it('rejects a root that is not an object', () => {
    expect(() => parseFlowJson('"just a string"')).toThrow(FlowImportError);
    expect(() => parseFlowJson('42')).toThrow(FlowImportError);
    expect(() => parseFlowJson('[]')).toThrow(FlowImportError);
  });

  it('rejects a node missing id', () => {
    expect(() => parseFlowJson(JSON.stringify({ type: 'visit' }))).toThrow(FlowImportError);
  });

  it('rejects a node missing type', () => {
    expect(() => parseFlowJson(JSON.stringify({ id: 'root' }))).toThrow(FlowImportError);
  });

  it('rejects a node whose type is not in the registry', () => {
    expect(() =>
      parseFlowJson(JSON.stringify({ id: 'root', type: 'not-a-real-command' })),
    ).toThrow(FlowImportError);
  });

  it('rejects props that is not an object', () => {
    expect(() =>
      parseFlowJson(JSON.stringify({ id: 'root', type: 'visit', props: 'nope' })),
    ).toThrow(FlowImportError);
  });

  it('rejects a props value that is not a string', () => {
    expect(() =>
      parseFlowJson(JSON.stringify({ id: 'root', type: 'visit', props: { url: 5 } })),
    ).toThrow(FlowImportError);
  });

  it('rejects children that is not an array', () => {
    expect(() =>
      parseFlowJson(JSON.stringify({ id: 'root', type: 'describe', children: {} })),
    ).toThrow(FlowImportError);
  });

  it('rejects the whole tree when a nested descendant is malformed (no partial import, HLD §19)', () => {
    const raw = JSON.stringify({
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [{ id: 'it-1', type: 'it', props: {}, children: [{ type: 'click' }] }],
    });
    expect(() => parseFlowJson(raw)).toThrow(FlowImportError);
  });
});

describe('serializeFlow / parseFlowJson round trip', () => {
  it('round-trips a realistic flow byte-for-byte in structure', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Login' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'logs in' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/login' } },
            { id: 'click-1', type: 'click', props: { selector: '#submit' } },
          ],
        },
      ],
    };
    expect(parseFlowJson(serializeFlow(flow))).toEqual(flow);
  });

  it('round-trips an empty (null) flow', () => {
    expect(parseFlowJson(serializeFlow(null))).toBeNull();
  });

  it('round-trips a flow containing Phase 2 block nodes (within/each/session) unchanged', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Grid' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'validates rows' },
          children: [
            {
              id: 'session-1',
              type: 'session',
              props: { id: 'login' },
              children: [{ id: 'visit-1', type: 'visit', props: { url: '/login' } }],
            },
            {
              id: 'within-1',
              type: 'within',
              props: { selector: '.grid' },
              children: [
                {
                  id: 'each-1',
                  type: 'each',
                  props: { selector: '.row' },
                  children: [{ id: 'log-1', type: 'log', props: { message: 'checked' } }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parseFlowJson(serializeFlow(flow))).toEqual(flow);
  });

  it('round-trips a flow containing Phase 3 reference producer/consumer nodes (as/fixture) unchanged', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'chain-1',
          type: 'chain',
          props: {},
          children: [
            { id: 'fixture-1', type: 'fixture', props: { path: 'user' } },
            { id: 'as-1', type: 'as', props: { name: 'userData' } },
          ],
        },
        { id: 'get-1', type: 'get', props: { selector: '@userData' } },
      ],
    };
    expect(parseFlowJson(serializeFlow(flow))).toEqual(flow);
  });

  it('round-trips a flow containing Phase 4 network nodes (intercept/waitAlias/request) unchanged', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'chain-1',
          type: 'chain',
          props: {},
          children: [
            { id: 'intercept-1', type: 'intercept', props: { method: 'GET', url: '/api/brands' } },
            { id: 'as-1', type: 'as', props: { name: 'getBrands' } },
          ],
        },
        { id: 'waitAlias-1', type: 'waitAlias', props: { alias: '@getBrands' } },
        { id: 'request-1', type: 'request', props: { method: 'POST', url: '/api/brands', body: "{ name: 'Acme' }" } },
      ],
    };
    expect(parseFlowJson(serializeFlow(flow))).toEqual(flow);
  });

  it('round-trips a flow containing Phase 5 completion nodes (switch/case/default/try) unchanged', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'switch-1',
          type: 'switch',
          props: { expression: 'role' },
          children: [
            { id: 'case-1', type: 'case', props: { value: "'admin'" }, children: [{ id: 'log-1', type: 'log', props: { message: 'hi' } }] },
            { id: 'default-1', type: 'default', props: {}, children: [] },
          ],
        },
        {
          id: 'try-1',
          type: 'try',
          props: {},
          children: [
            { id: 'slot-try', type: 'slot', props: { name: 'try' }, children: [{ id: 'click-1', type: 'click', props: { selector: '.x' } }] },
            { id: 'slot-catch', type: 'slot', props: { name: 'catch' }, children: [] },
            { id: 'slot-finally', type: 'slot', props: { name: 'finally' }, children: [] },
          ],
        },
      ],
    };
    expect(parseFlowJson(serializeFlow(flow))).toEqual(flow);
  });

  it('round-trips a flowInvocation of one of the newly expanded starter flows unchanged', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'invoke-1',
          type: 'flowInvocation',
          props: { flowId: 'gridRowAction', rowSelector: '.grid-row', rowIndex: '2', actionSelector: '.archive-btn' },
        },
      ],
    };
    expect(parseFlowJson(serializeFlow(flow))).toEqual(flow);
  });

  it('rejects the whole import when an unknown type is nested inside an otherwise-valid switch/case tree (no partial import)', () => {
    const brokenRaw = JSON.stringify({
      id: 'root',
      type: 'switch',
      props: { expression: 'x' },
      children: [
        { id: 'case-1', type: 'case', props: { value: '1' }, children: [{ id: 'ghost-1', type: 'not-a-real-type', props: {} }] },
      ],
    });
    expect(() => parseFlowJson(brokenRaw)).toThrow(FlowImportError);
  });
});
