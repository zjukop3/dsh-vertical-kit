# Document check (agent tool)

One tool, 31 document checks. The model verifies a document it produced against a
genre's structural rules **before** delivering it, and gets findings with rule ids
and line numbers.

## What it does

The 31 checks in this project already existed, but only as HTTP endpoints: a person
had to remember to `POST` a document to `/adr-check/api`, and an agent had no reason
to. A tool is the layer the model can see and decide to call, which makes "check it
before you hand it over" something that can actually happen.

It registers a single tool, `document_check`, with one required `check` parameter
whose values are the 31 slugs. One tool, not 31: twenty-seven tool definitions crowd
the prompt, and in the first ten minutes a model cannot tell
`adr_check` from `spec_doc_check` anyway.

It carries no rules of its own. Each check keeps deciding, and the tool calls that
check's exported linter directly — no HTTP hop, no port, no network, no model call.

## How to use it

The agent calls it on its own: `document_check({ check: 'adr-check', text })`. A
human can run the same implementation:

```
npx dsh-document-check adr-check ./docs/adr-014.md
```

Exit codes: 0 clean, 1 errors, 2 usage. Warnings never block, by the same rule the
individual checks follow.

## What it returns

```
ok: false, 3 error(s), 1 warning(s)
error status-missing line 0: 没有状态（认得：状态：已接受、Status: Accepted、…）
```

At most 25 findings per call, plus an explicit note when more exist: a checker that
dumps 200 findings into the context gets turned off, and the first 25 are the ones
worth fixing anyway.

## Limitations

- Structural only. It says an ADR has a decision section; it never says the decision
  is a good one.
- Genre mismatch is not detected. Checking a résumé with `invoice-check` is allowed
  and useless; the tool trusts the caller's `check` value.
- 31 genres, not 31 languages of one genre: the rules were calibrated on public
  documents in the language each check's README names.
