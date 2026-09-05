import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ActionList,
  ActionListItem,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CpuIcon,
  FileUpload,
  FileUploadItem,
  FlaskIcon,
  FloatingActionButton,
  Heading,
  IconButton,
  PlayIcon,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRow,
  TableToolbar,
  TableToolbarActions,
  Text,
  Dropdown,
  DropdownOverlay,
  FilterChipSelectInput,
  SearchInput,
  TextInput,
  ToastContainer,
  useToast,
} from '@razorpay/blade/components';
import type { BladeFile } from '@razorpay/blade/components';
import { createReconSummary, runDeterministicPhase, runExceptionPhaseAsync } from './engine';
import { parseBankStatement, parseInternalOrders, parseRazorpayRecon } from './csv';
import type { ExceptionEvidence, ReconInput, ReconRun } from './types';
import { formatPaise } from './currency';

type SetInput = (input: Partial<ReconInput> | ((current: Partial<ReconInput>) => Partial<ReconInput>)) => void;
type SourceFiles = [string?, string?, string?];
type SetSourceFiles = (files: SourceFiles | ((current: SourceFiles) => SourceFiles)) => void;
type SourceNativeFiles = [boolean, boolean, boolean];
type SetSourceNativeFiles = (files: SourceNativeFiles | ((current: SourceNativeFiles) => SourceNativeFiles)) => void;
type TestFiles = [BladeFile?, BladeFile?, BladeFile?];
type SetTestFiles = (files: TestFiles | ((current: TestFiles) => TestFiles)) => void;

export default function App() {
  const [run, setRun] = useState<ReconRun | null>(null);
  const [stage, setStage] = useState<'idle' | 'loading' | 'complete'>('idle');
  const [input, setInput] = useState<Partial<ReconInput>>({});
  const [razorpayApiKey, setRazorpayApiKey] = useState('');
  const [sourceFiles, setSourceFiles] = useState<SourceFiles>([]);
  const [sourceNativeFiles, setSourceNativeFiles] = useState<SourceNativeFiles>([false, false, false]);
  const [testFiles, setTestFiles] = useState<TestFiles>([]);
  const [showReview, setShowReview] = useState(false);
  const { show } = useToast();

  const resetHome = () => {
    setRun(null);
    setStage('idle');
    setInput({});
    setSourceFiles([]);
    setSourceNativeFiles([false, false, false]);
    setTestFiles([]);
    setRazorpayApiKey('');
    setShowReview(false);
  };

  const executeReconciliation = async () => {
    setStage('loading');
    try {
      if (!input.internal_orders || !input.bank_statement || (!input.razorpay_recon && !razorpayApiKey)) {
        throw new Error('Add the merchant ledger, bank statement, and gateway settlements source before executing.');
      }
      if (!input.razorpay_recon) throw new Error('Live Razorpay API ingestion is not enabled yet. Upload the gateway settlements CSV.');
      const completeInput: ReconInput = {
        internal_orders: input.internal_orders,
        razorpay_recon: input.razorpay_recon,
        bank_statement: input.bank_statement,
        settlement_batches: deriveSettlementBatches(input.razorpay_recon),
      };
      const deterministic = runDeterministicPhase(completeInput);
      const exceptions = await runExceptionPhaseAsync(deterministic.unmatched);
      setRun({
        reconciled: deterministic.reconciled,
        ai_resolved: exceptions.ai_resolved,
        quarantined: exceptions.quarantined,
        ai_status: exceptions.ai_status,
        total_orders: completeInput.internal_orders.length,
        seed: 0,
        summary: createReconSummary(completeInput, exceptions.ai_resolved, exceptions.quarantined),
      });
      setStage('complete');
    } catch (runError) {
      setStage('idle');
      show({
        content: runError instanceof Error ? runError.message : 'The reconciliation could not be completed.',
        color: 'negative',
        leading: AlertTriangleIcon,
        autoDismiss: true,
      });
    }
  };

  const loadTestData = async () => {
    try {
      const responses = await Promise.all([
        fetch('/demo-data/merchant-ledger.csv'),
        fetch('/demo-data/gateway-settlements.csv'),
        fetch('/demo-data/bank-statement.csv'),
      ]);
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) throw new Error(`Test data could not be loaded (${failedResponse.status}).`);
      const [ledgerCsv, settlementsCsv, bankCsv] = await Promise.all(responses.map((response) => response.text()));
      setInput({
        internal_orders: parseInternalOrders(ledgerCsv),
        razorpay_recon: parseRazorpayRecon(settlementsCsv),
        bank_statement: parseBankStatement(bankCsv),
      });
      setSourceFiles(['merchant-ledger.csv', 'gateway-settlements.csv', 'bank-statement.csv']);
      setSourceNativeFiles([false, false, false]);
      setTestFiles([
        makeTestFile('merchant-ledger.csv', ledgerCsv),
        makeTestFile('gateway-settlements.csv', settlementsCsv),
        makeTestFile('bank-statement.csv', bankCsv),
      ]);
      setRun(null);
      setShowReview(false);
      setStage('idle');
      show({ content: 'Test data loaded. Execute the reconciliation when ready.', autoDismiss: true });
    } catch (loadError) {
      show({
        content: loadError instanceof Error ? loadError.message : 'Test data could not be loaded.',
        color: 'negative',
        leading: AlertTriangleIcon,
        autoDismiss: true,
      });
    }
  };

  return (
    <div className="setl-app">
      <Box minHeight="100vh">
        <Box maxWidth="1240px" margin="auto" padding={{ base: 'spacing.5', m: 'spacing.8' }}>
          <header className="setl-nav">
            {showReview ? (
              <IconButton icon={ArrowLeftIcon} accessibilityLabel="Back to reconciliation" onClick={() => setShowReview(false)} />
            ) : (
              <a className="setl-home-link" href="/" onClick={(event) => { event.preventDefault(); resetHome(); }}>SETL<span className="setl-mark">•</span></a>
            )}
          </header>
          {showReview && run ? (
            <ReviewWorkspace run={run} />
          ) : (
            <LandingHero
              stage={stage}
              run={run}
              sourceFiles={sourceFiles}
              sourceNativeFiles={sourceNativeFiles}
              testFiles={testFiles}
              setInput={setInput}
              setSourceFiles={setSourceFiles}
              setSourceNativeFiles={setSourceNativeFiles}
              setTestFiles={setTestFiles}
              razorpayApiKey={razorpayApiKey}
              setRazorpayApiKey={setRazorpayApiKey}
              executeReconciliation={executeReconciliation}
              show={show}
              onReview={() => setShowReview(true)}
            />
          )}
        </Box>
      </Box>
      {!showReview ? (
        <FloatingActionButton icon={FlaskIcon} placement="bottom-end" offset="spacing.5" zIndex={3100} accessibilityLabel="Use test data" onClick={() => void loadTestData()}>
          Use test data
        </FloatingActionButton>
      ) : null}
      <ToastContainer zIndex={3000} />
    </div>
  );
}

function LandingHero({ stage, run, sourceFiles, sourceNativeFiles, testFiles, setInput, setSourceFiles, setSourceNativeFiles, setTestFiles, razorpayApiKey, setRazorpayApiKey, executeReconciliation, show, onReview }: {
  stage: 'idle' | 'loading' | 'complete';
  run: ReconRun | null;
  sourceFiles: SourceFiles;
  sourceNativeFiles: SourceNativeFiles;
  testFiles: TestFiles;
  setInput: SetInput;
  setSourceFiles: SetSourceFiles;
  setSourceNativeFiles: SetSourceNativeFiles;
  setTestFiles: SetTestFiles;
  razorpayApiKey: string;
  setRazorpayApiKey: (value: string) => void;
  executeReconciliation: () => void;
  show: ReturnType<typeof useToast>['show'];
  onReview: () => void;
}) {
  return (
    <main className="landing">
      <Box maxWidth="760px" marginBottom={{ base: 'spacing.5', m: 'spacing.7' }}>
        <div className="landing-title"><Heading size="xlarge">Reconcile with confidence.</Heading></div>
        <Text size="medium">Match your records, explain the exceptions, and keep every decision auditable.</Text>
      </Box>
      <FlowMap active={stage === 'loading'} run={run} sourceFiles={sourceFiles} sourceNativeFiles={sourceNativeFiles} testFiles={testFiles} setInput={setInput} setSourceFiles={setSourceFiles} setSourceNativeFiles={setSourceNativeFiles} setTestFiles={setTestFiles} razorpayApiKey={razorpayApiKey} setRazorpayApiKey={setRazorpayApiKey} executeReconciliation={executeReconciliation} show={show} onReview={onReview} />
    </main>
  );
}

function FlowMap({ active, run, sourceFiles, sourceNativeFiles, testFiles, setInput, setSourceFiles, setSourceNativeFiles, setTestFiles, razorpayApiKey, setRazorpayApiKey, executeReconciliation, show, onReview }: {
  active: boolean;
  run: ReconRun | null;
  sourceFiles: SourceFiles;
  sourceNativeFiles: SourceNativeFiles;
  testFiles: TestFiles;
  setInput: SetInput;
  setSourceFiles: SetSourceFiles;
  setSourceNativeFiles: SetSourceNativeFiles;
  setTestFiles: SetTestFiles;
  razorpayApiKey: string;
  setRazorpayApiKey: (value: string) => void;
  executeReconciliation: () => void;
  show: ReturnType<typeof useToast>['show'];
  onReview: () => void;
}) {
  const nodes = [['Merchant ledger', 'Orders & gross value'], ['Gateway settlements', 'Payments, fees & holds'], ['Bank statement', 'Settlement credits']];
  const mapRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<Array<HTMLDivElement | null>>([]);
  const coreRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [diagram, setDiagram] = useState<DiagramGeometry | null>(null);

  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const bounds = map.getBoundingClientRect();
      const point = (element: HTMLDivElement | null, side: 'left' | 'right', ratio = 0.5) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: (side === 'left' ? rect.left : rect.right) - bounds.left, y: rect.top - bounds.top + rect.height * ratio };
      };
      const sources = sourceRefs.current.map((element) => point(element, 'right'));
      const core = coreRef.current?.getBoundingClientRect();
      const output = outputRef.current?.getBoundingClientRect();
      if (!core || !output || sources.some((source) => !source)) return;
      setDiagram({
        width: bounds.width,
        height: bounds.height,
        sources: sources as DiagramPoint[],
        targets: [0.28, 0.5, 0.72].map((ratio) => ({ x: core.left - bounds.left, y: core.top - bounds.top + core.height * ratio })),
        resultStart: { x: core.right - bounds.left, y: core.top - bounds.top + core.height * 0.5 },
        resultEnd: { x: output.left - bounds.left, y: output.top - bounds.top + output.height * 0.5 },
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(map);
    sourceRefs.current.forEach((element) => element && observer.observe(element));
    if (coreRef.current) observer.observe(coreRef.current);
    if (outputRef.current) observer.observe(outputRef.current);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [run, active]);

  return (
    <div ref={mapRef} className={`flow-map${active ? ' flow-active' : ''}`} aria-label="Reconciliation flow">
      {nodes.map(([title, detail], index) => (
        <div ref={(element) => { sourceRefs.current[index] = element; }} key={title} className={`flow-source flow-source-${index + 1}`}>
          <Card padding="spacing.5"><CardBody>
            <Heading size="small">{title}</Heading>
            <Text size="small" marginTop="spacing.2">{detail}</Text>
            <div className={`source-upload${sourceFiles[index] ? ' source-upload-loaded' : ''}${sourceFiles[index] && !sourceNativeFiles[index] ? ' source-upload-test' : ''}`}>
              <FileUpload accessibilityLabel={`Upload ${title} CSV`} accept=".csv,text/csv" size="medium" uploadType="single" fileList={testFiles[index] ? [testFiles[index]!] : undefined} onChange={({ fileList }) => {
                const file = fileList[0];
                if (file) void readSourceFile(index, file, setInput, setSourceFiles, setSourceNativeFiles, setTestFiles, show);
              }} />
              {sourceFiles[index] && !sourceNativeFiles[index] ? (
                <div className="source-test-file">
                  {testFiles[index] ? <FileUploadItem file={testFiles[index]} size="medium" /> : null}
                  <a href="/" className="source-test-file-replace" onClick={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget.closest('.source-upload')?.querySelector('input[type="file"]');
                    if (input instanceof HTMLInputElement) input.click();
                  }}>Replace</a>
                </div>
              ) : null}
            </div>
            {index === 1 ? <TextInput label="Or use a Razorpay API key" value={razorpayApiKey} onChange={({ value }) => setRazorpayApiKey(value ?? '')} /> : null}
          </CardBody></Card>
        </div>
      ))}
      {diagram ? <FlowArrows diagram={diagram} /> : null}
      <div ref={coreRef} className="flow-core"><Card padding="spacing.5"><CardBody>
        <Box display="flex" alignItems="center" gap="spacing.2"><CpuIcon size="small" color="currentColor" /><Text size="small" weight="semibold">Reconciliation engine</Text></Box>
        <Heading size="medium" marginTop="spacing.3">Reconcile</Heading>
        <Text size="small" marginTop="spacing.2">Match · Explain · Quarantine</Text>
        <Button marginTop="spacing.4" variant="primary" icon={PlayIcon} iconPosition="left" onClick={executeReconciliation} isLoading={active}>Execute reconciliation</Button>
      </CardBody></Card></div>
      <div ref={outputRef} className="flow-output"><Card padding="spacing.5"><CardBody>
        {active ? <><Text size="small">Running reconciliation</Text><Heading size="medium" marginTop="spacing.2">Following the flow</Heading><Text size="small" marginTop="spacing.2">Matching records and evaluating exceptions…</Text></> : run ? <><Text size="small">Reconciliation complete</Text><Heading size="medium" marginTop="spacing.2">Review the close</Heading>{run.ai_status === 'quota_exceeded' ? <div className="ai-quota-notice"><Text weight="semibold">AI review paused: token quota reached</Text><Text size="small" marginTop="spacing.1">The remaining exceptions were safely held for human review. Retry after the Gemini quota resets.</Text></div> : null}<Box display="flex" flexWrap="wrap" gap="spacing.2" marginTop="spacing.3"><Badge color="positive">{`${run.reconciled.length} reconciled`}</Badge><Badge color="notice">{`${run.ai_resolved.length} auto-resolved`}</Badge><Badge color="negative">{`${run.quarantined.length} needs review`}</Badge></Box><Button marginTop="spacing.4" variant="primary" onClick={onReview}>Review findings</Button></> : <><Text size="small">Result</Text><Heading size="medium" marginTop="spacing.2">A clear close</Heading><Text size="small" marginTop="spacing.2">Matched, explained, or held for review</Text></>}
      </CardBody></Card></div>
    </div>
  );
}

async function readSourceFile(index: number, file: File, setInput: SetInput, setSourceFiles: SetSourceFiles, setSourceNativeFiles: SetSourceNativeFiles, setTestFiles: SetTestFiles, show: ReturnType<typeof useToast>['show']) {
  try {
    const csv = await file.text();
    if (index === 0) setInput((current) => ({ ...current, internal_orders: parseInternalOrders(csv) }));
    if (index === 1) setInput((current) => ({ ...current, razorpay_recon: parseRazorpayRecon(csv) }));
    if (index === 2) setInput((current) => ({ ...current, bank_statement: parseBankStatement(csv) }));
    setSourceFiles((current) => { const next = [...current] as SourceFiles; next[index] = file.name; return next; });
    setSourceNativeFiles((current) => { const next = [...current] as SourceNativeFiles; next[index] = true; return next; });
    setTestFiles((current) => { const next = [...current] as TestFiles; next[index] = undefined; return next; });
  } catch (readError) {
    show({ content: readError instanceof Error ? readError.message : 'This CSV could not be read.', color: 'negative', leading: AlertTriangleIcon, autoDismiss: true });
  }
}

function makeTestFile(name: string, contents: string): BladeFile {
  const file = new File([contents], name, { type: 'text/csv' }) as BladeFile;
  file.status = 'success';
  return file;
}

function deriveSettlementBatches(rows: ReconInput['razorpay_recon']): ReconInput['settlement_batches'] {
  const batches = new Map<string, ReconInput['settlement_batches'][number]>();
  for (const row of rows) {
    const existing = batches.get(row.settlement_id);
    if (existing) {
      existing.amount += row.credit - row.debit;
      existing.fees += row.fee;
      existing.tax += row.tax;
    } else {
      batches.set(row.settlement_id, { id: row.settlement_id, entity: 'settlement', amount: row.credit - row.debit, status: row.settled ? 'processed' : 'created', fees: row.fee, tax: row.tax, utr: row.settlement_utr, created_at: row.created_at });
    }
  }
  return [...batches.values()];
}

interface DiagramPoint { x: number; y: number; }
interface DiagramGeometry { width: number; height: number; sources: DiagramPoint[]; targets: DiagramPoint[]; resultStart: DiagramPoint; resultEnd: DiagramPoint; }

function FlowArrows({ diagram }: { diagram: DiagramGeometry }) {
  const curve = (start: DiagramPoint, end: DiagramPoint) => {
    const distance = Math.max(32, (end.x - start.x) * 0.45);
    return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`;
  };
  return <svg className="flow-arrows" viewBox={`0 0 ${diagram.width} ${diagram.height}`} aria-hidden="true">
    <defs>
      <marker id="flow-arrow-head-base" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
      <marker id="flow-arrow-head-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
    </defs>
    {diagram.sources.map((source, index) => <path key={index} className="flow-arrow-base" d={curve(source, diagram.targets[index])} markerEnd="url(#flow-arrow-head-base)" />)}
    <path className="flow-arrow-base" d={curve(diagram.resultStart, diagram.resultEnd)} markerEnd="url(#flow-arrow-head-base)" />
    {diagram.sources.map((source, index) => <path key={`active-${index}`} className="flow-arrow-active" pathLength="1" d={curve(source, diagram.targets[index])} markerEnd="url(#flow-arrow-head-active)" />)}
    <path className="flow-arrow-active" pathLength="1" d={curve(diagram.resultStart, diagram.resultEnd)} markerEnd="url(#flow-arrow-head-active)" />
  </svg>;
}

interface ReviewRow {
  id: string;
  status: 'Reconciled' | 'Auto-resolved' | 'Needs review';
  reference: string;
  customerName?: string;
  vendorName?: string;
  detail: string;
  amount: string;
  confidence?: string;
  reasoning?: string;
  action?: string;
  grossPaise?: number;
  refundPaise?: number;
  feePaise?: number;
  taxPaise?: number;
  expectedNetPaise?: number;
  bankCreditPaise?: number;
  settlementBatchOrderCount?: number;
  settlementBatchGatewayPaise?: number;
  settlementBatchBankPaise?: number;
  variancePaise: number;
  settlementId?: string;
  utr?: string;
  evidence?: ExceptionEvidence;
}

type ReviewWorkflowStatus = 'Open' | 'In review' | 'Resolved' | 'Not applicable';

function reviewWorkflowStatus(row: ReviewRow, decisions: Record<string, 'note-saved' | 'kept-open' | 'resolved'>): ReviewWorkflowStatus {
  if (row.status !== 'Needs review') return 'Not applicable';
  return decisions[row.id] === 'resolved' ? 'Resolved' : decisions[row.id] === 'kept-open' || decisions[row.id] === 'note-saved' ? 'In review' : 'Open';
}

function expectedNetFromEvidence(evidence?: ExceptionEvidence): number | undefined {
  if (evidence?.payment_amount_paise === undefined) return undefined;
  const base = evidence.payment_credit_paise
    ?? evidence.payment_amount_paise - (evidence.gateway_fee_paise ?? 0) - (evidence.gateway_tax_paise ?? 0);
  return base - (evidence.refund_paise ?? 0) - (evidence.adjustment_paise ?? 0);
}

function paymentStatus(evidence?: ExceptionEvidence): string | undefined {
  if (!evidence || (evidence.payment_on_hold === undefined && evidence.payment_settled === undefined)) return undefined;
  if (evidence.payment_on_hold) return 'On reserve hold';
  if (evidence.payment_settled) return 'Settled';
  return 'Not settled';
}

function workflowStatusColor(status: ReviewWorkflowStatus): 'positive' | 'notice' | 'negative' {
  return status === 'Resolved' ? 'positive' : status === 'In review' ? 'notice' : 'negative';
}

type StoredReviewProgress = {
  notes: Record<string, string>;
  decisions: Record<string, 'note-saved' | 'kept-open' | 'resolved'>;
  updatedAt: Record<string, string>;
};

function loadReviewProgress(key: string): StoredReviewProgress {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return { notes: {}, decisions: {}, updatedAt: {} };
    const parsed = JSON.parse(stored) as Partial<StoredReviewProgress>;
    return { notes: parsed.notes ?? {}, decisions: parsed.decisions ?? {}, updatedAt: parsed.updatedAt ?? {} };
  } catch {
    return { notes: {}, decisions: {}, updatedAt: {} };
  }
}

function saveReviewProgress(key: string, progress: StoredReviewProgress): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // Local persistence is best effort; review actions remain usable.
  }
}

function ReviewWorkspace({ run }: { run: ReconRun }) {
  const rows: ReviewRow[] = [
    ...run.reconciled.map((item) => ({ id: item.id, status: 'Reconciled' as const, reference: item.order_id, customerName: item.customer_name, vendorName: item.vendor_name, detail: 'Matched', amount: formatPaise(item.bank_credit_paise), action: 'No action needed', grossPaise: item.gross_amount_paise, feePaise: item.fee_paise, taxPaise: item.tax_paise, expectedNetPaise: item.gross_amount_paise - item.fee_paise - item.tax_paise, bankCreditPaise: item.bank_credit_paise, variancePaise: item.bank_credit_paise - (item.gross_amount_paise - item.fee_paise - item.tax_paise), settlementId: item.settlement_id, utr: item.utr, settlementBatchOrderCount: item.settlement_batch_order_count, settlementBatchGatewayPaise: item.settlement_batch_gateway_paise, settlementBatchBankPaise: item.settlement_batch_bank_paise })),
    ...run.ai_resolved.map((item) => {
      const evidence = item.evidence;
      const expectedNetPaise = expectedNetFromEvidence(evidence);
      return { id: item.exception_id, status: 'Auto-resolved' as const, reference: item.order_id ?? item.exception_id, customerName: item.customer_name, vendorName: item.vendor_name, detail: item.root_cause, amount: formatPaise(item.delta_paise), confidence: `${Math.round(item.confidence * 100)}% deterministic`, reasoning: item.audit_trail, action: item.suggested_entry, variancePaise: item.delta_paise, evidence, grossPaise: evidence?.order_amount_paise, feePaise: evidence?.gateway_fee_paise, taxPaise: evidence?.gateway_tax_paise, expectedNetPaise, bankCreditPaise: evidence?.bank_credit_paise, settlementId: evidence?.settlement_id, utr: evidence?.settlement_utr };
    }),
    ...run.quarantined.map((item) => {
      const evidence = item.evidence;
      const expectedNetPaise = expectedNetFromEvidence(evidence);
      const isBatchException = item.reason === 'BATCH_TOTAL_MISMATCH' || item.reason === 'ORPHAN_BANK_CREDIT';
      const grossPaise = evidence?.order_amount_paise ?? (item.reason === 'MISSING_PAYMENT' ? item.delta_paise : undefined);
      return { id: item.exception_id, status: 'Needs review' as const, reference: item.order_id ?? evidence?.settlement_utr ?? item.exception_id, customerName: item.customer_name ?? (isBatchException ? 'Settlement batch' : undefined), vendorName: item.vendor_name ?? (isBatchException ? 'Bank settlement' : undefined), detail: item.reason, amount: formatPaise(item.delta_paise), confidence: `${Math.round(item.confidence * 100)}%`, reasoning: item.reasoning, action: 'Review and decide', variancePaise: item.delta_paise, evidence, grossPaise, feePaise: evidence?.gateway_fee_paise, taxPaise: evidence?.gateway_tax_paise, expectedNetPaise, bankCreditPaise: evidence?.bank_credit_paise, settlementId: evidence?.settlement_id, utr: evidence?.settlement_utr, settlementBatchOrderCount: evidence?.batch_order_count, settlementBatchGatewayPaise: evidence?.batch_gateway_paise, settlementBatchBankPaise: evidence?.batch_bank_paise };
    }),
  ];
  const [selectedRow, setSelectedRow] = useState<ReviewRow | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | ReviewWorkflowStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const reviewStorageKey = `setl:review-progress:${run.total_orders}:${run.summary.gross_order_paise}:${run.summary.bank_credit_paise}`;
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>(() => loadReviewProgress(reviewStorageKey).notes);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, 'note-saved' | 'kept-open' | 'resolved'>>(() => loadReviewProgress(reviewStorageKey).decisions);
  const [reviewUpdatedAt, setReviewUpdatedAt] = useState<Record<string, string>>(() => loadReviewProgress(reviewStorageKey).updatedAt);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    saveReviewProgress(reviewStorageKey, {
      notes: reviewNotes,
      decisions: reviewDecisions,
      updatedAt: reviewUpdatedAt,
    });
  }, [reviewDecisions, reviewNotes, reviewStorageKey, reviewUpdatedAt]);
  const filteredRows = rows.filter((row) => {
    const matchesStatus = statusFilter === 'All' || reviewWorkflowStatus(row, reviewDecisions) === statusFilter;
    const matchesCategory = !categoryFilter || row.detail === categoryFilter;
    const search = query.trim().toLowerCase();
    return matchesStatus && matchesCategory && (!search || `${row.customerName ?? ''} ${row.vendorName ?? ''} ${row.reference} ${row.detail} ${row.id} ${row.settlementId ?? ''} ${row.utr ?? ''}`.toLowerCase().includes(search));
  });
  const clearFilters = () => { setQuery(''); setStatusFilter('All'); setCategoryFilter(null); };
  const exportRows = () => {
    const headers = ['status', 'review_status', 'review_note', 'review_updated_at', 'customer', 'vendor', 'reference', 'exception_id', 'detail', 'amount_inr', 'amount_paise', 'settlement_id', 'bank_utr'];
    const csvRows = rows.map((row) => {
      const decision = reviewDecisions[row.id];
      const reviewStatus = decision === 'resolved' ? 'Resolved' : decision === 'kept-open' ? 'In review' : row.status === 'Needs review' ? 'Open' : 'Not applicable';
      return [row.status, reviewStatus, reviewNotes[row.id] ?? '', reviewUpdatedAt[row.id] ?? '', row.customerName ?? '', row.vendorName ?? '', row.reference, row.id, row.detail, String(parseAmount(row.amount)), String(Math.round(parseAmount(row.amount) * 100)), row.settlementId ?? '', row.utr ?? ''].map(csvValue).join(',');
    });
    const csv = `\uFEFF${[headers.join(','), ...csvRows].join('\r\n')}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'setl-reconciliation-review.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  if (selectedRow) {
    return <main className="results">
      <Button variant="tertiary" icon={ArrowLeftIcon} iconPosition="left" onClick={() => setSelectedRow(null)}>Back to findings</Button>
      <Box marginTop="spacing.5" marginBottom="spacing.6">
        <Text size="small">Finding details</Text>
        <Heading size="xlarge" marginTop="spacing.2">{selectedRow.reference}</Heading>
        <Box display="flex" gap="spacing.2" marginTop="spacing.3"><Badge color={statusColor(selectedRow.status)}>{selectedRow.status}</Badge>{selectedRow.status === 'Needs review' ? <Badge color={workflowStatusColor(reviewWorkflowStatus(selectedRow, reviewDecisions))}>{reviewWorkflowStatus(selectedRow, reviewDecisions)}</Badge> : null}{selectedRow.confidence ? <Badge color="neutral">{selectedRow.confidence} confidence</Badge> : null}</Box>
      </Box>
      <div className="review-detail-grid">
        <section className="detail-panel"><Text size="small">What happened</Text><Heading size="medium" marginTop="spacing.2">{readableReason(selectedRow.detail)}</Heading><Text size="small" marginTop="spacing.3">{selectedRow.action}</Text></section>
        <section className="detail-panel"><Text size="small">{selectedRow.status === 'Needs review' ? 'Review decision' : 'Decision trail'}</Text><Text marginTop="spacing.3">{selectedRow.reasoning ?? 'This record matched deterministically across the uploaded sources.'}</Text>{selectedRow.detail === 'MISSING_PAYMENT' ? <AutomatedChecks /> : null}{selectedRow.status === 'Needs review' ? <Box marginTop="spacing.4"><TextInput label="Review note" accessibilityLabel="Review note" placeholder={reviewNotePlaceholder(selectedRow)} value={reviewNote} onChange={({ value }) => setReviewNote(value ?? '')} /><Box display="flex" gap="spacing.2" marginTop="spacing.3"><Button variant="primary" isDisabled={!reviewNote.trim()} onClick={() => { const timestamp = new Date().toISOString(); setReviewNotes((current) => ({ ...current, [selectedRow.id]: reviewNote.trim() })); setReviewDecisions((current) => ({ ...current, [selectedRow.id]: 'resolved' })); setReviewUpdatedAt((current) => ({ ...current, [selectedRow.id]: timestamp })); setReviewNote(''); }}>Mark resolved</Button><Button variant="secondary" onClick={() => { const timestamp = new Date().toISOString(); setReviewNotes((current) => ({ ...current, [selectedRow.id]: reviewNote.trim() || 'Kept open for further investigation.' })); setReviewDecisions((current) => ({ ...current, [selectedRow.id]: 'kept-open' })); setReviewUpdatedAt((current) => ({ ...current, [selectedRow.id]: timestamp })); }}>Keep open</Button></Box>{reviewDecisions[selectedRow.id] ? <Text size="small" marginTop="spacing.2">Saved locally · {reviewDecisions[selectedRow.id] === 'resolved' ? 'Resolved' : 'In review'}</Text> : null}</Box> : null}</section>
      </div>
      <section className="detail-panel detail-financial-panel">
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap="spacing.4" flexWrap="wrap">
          <Box><Heading size="medium">Settlement bridge</Heading><Text size="small" marginTop="spacing.1">{selectedRow.detail === 'MISSING_PAYMENT' ? 'The ledger order is known, but no matching gateway payment or settlement was found.' : selectedRow.detail === 'CHARGEBACK_CLAWBACK' ? 'The gateway recorded a chargeback adjustment against this payment. Confirm the dispute outcome before accepting the debit.' : selectedRow.detail === 'BATCH_TOTAL_MISMATCH' ? 'This exception compares the aggregate gateway settlement batch with the single bank credit carrying the same UTR.' : selectedRow.settlementBatchOrderCount ? `This order is allocated within a ${selectedRow.settlementBatchOrderCount}-order settlement batch. The bank credit belongs to the batch, not this order alone.` : 'How the expected settlement compares with the bank credit.'}</Text></Box>
          <Box textAlign="right"><Text size="small">Variance</Text><Box marginTop="spacing.1"><CurrencyText value={selectedRow.variancePaise} variant="large" color={selectedRow.variancePaise === 0 ? 'positive' : 'negative'} /></Box></Box>
        </Box>
        <div className="detail-financial-lines">
          <FinancialLine label={selectedRow.detail === 'MISSING_PAYMENT' ? 'Ledger order value' : 'Gross order value'} value={selectedRow.grossPaise} />
          <FinancialLine label={selectedRow.detail === 'CHARGEBACK_CLAWBACK' ? 'Chargeback adjustment' : 'Refunds and adjustments'} value={selectedRow.detail === 'CHARGEBACK_CLAWBACK' ? selectedRow.evidence?.adjustment_paise : selectedRow.evidence?.refund_paise ?? selectedRow.refundPaise} negative />
          <FinancialLine label="Gateway fees" value={selectedRow.feePaise} negative />
          <FinancialLine label="GST on gateway fees" value={selectedRow.taxPaise} negative />
          <FinancialLine label="Expected net settlement" value={selectedRow.expectedNetPaise} emphasis />
          <FinancialLine label={selectedRow.settlementBatchOrderCount ? 'Settlement batch bank credit' : 'Bank credit received'} value={selectedRow.settlementBatchBankPaise ?? selectedRow.bankCreditPaise} color="positive" />
        </div>
        {selectedRow.settlementBatchOrderCount ? <div className="batch-reconciliation-note"><Text size="small">Batch calculation</Text><Text size="small">{formatPaise(selectedRow.settlementBatchGatewayPaise ?? 0)} gateway net across {selectedRow.settlementBatchOrderCount} orders − {selectedRow.settlementBatchBankPaise === undefined ? 'no bank batch credit' : formatPaise(selectedRow.settlementBatchBankPaise)} bank credit = {formatPaise(Math.abs((selectedRow.settlementBatchGatewayPaise ?? 0) - (selectedRow.settlementBatchBankPaise ?? 0)))} variance</Text></div> : null}
        <Text size="small" marginTop="spacing.4">{selectedRow.detail === 'MISSING_PAYMENT' ? 'Next steps: search Razorpay by order ID, receipt, customer, and amount; then check the bank statement by settlement UTR and date. Keep open until the payment is found, confirmed absent, or escalated to operations.' : 'Unavailable source values are shown as “Not available” rather than inferred.'}</Text>
      </section>
      <section className="detail-panel detail-source-panel">
        <Heading size="medium">Evidence from source systems</Heading>
        <Text size="small" marginTop="spacing.1">{selectedRow.status === 'Auto-resolved' ? 'This outcome was resolved by a deterministic rule using the source values below.' : 'Compare the original records before deciding. Values shown here are source evidence, not inferred values.'}</Text>
        <div className="detail-source-comparison">
          <div className="detail-source-card"><Text size="small">{selectedRow.customerName === 'Settlement batch' ? 'Settlement batch' : 'Merchant ledger'}</Text><SourceAvailability available={Boolean(selectedRow.customerName === 'Settlement batch' ? selectedRow.evidence?.settlement_utr : selectedRow.reference)} /><SourceField label={selectedRow.customerName === 'Settlement batch' ? 'Batch reference' : 'Order reference'} value={selectedRow.reference} /><SourceField label="Customer" value={selectedRow.customerName === 'Settlement batch' ? undefined : selectedRow.customerName} /><SourceField label="Vendor" value={selectedRow.customerName === 'Settlement batch' ? undefined : selectedRow.vendorName} /><SourceAmount label={selectedRow.customerName === 'Settlement batch' ? 'Batch variance' : 'Order value'} value={selectedRow.grossPaise ?? selectedRow.evidence?.order_amount_paise ?? (selectedRow.customerName === 'Settlement batch' ? selectedRow.variancePaise : undefined)} /></div>
          <div className="detail-source-card"><Text size="small">Gateway settlement</Text><SourceAvailability available={Boolean(selectedRow.evidence?.payment_amount_paise ?? selectedRow.settlementId ?? selectedRow.evidence?.adjustment_paise ?? selectedRow.evidence?.adjustment_id)} missingLabel={selectedRow.detail === 'CHARGEBACK_CLAWBACK' ? 'No gateway payment or adjustment found' : 'No matching gateway payment found'} /><SourceField label="Settlement ID" value={selectedRow.settlementId ?? selectedRow.evidence?.settlement_id} /><SourceField label="Settlement UTR" value={selectedRow.evidence?.settlement_utr} /><SourceField label="Payment ID" value={selectedRow.evidence?.payment_id} /><SourceField label="Adjustment ID" value={selectedRow.evidence?.adjustment_id} /><SourceField label="Dispute ID" value={selectedRow.evidence?.dispute_id} /><SourceAmount label="Payment amount" value={selectedRow.evidence?.payment_amount_paise} /><SourceAmount label="Fees and tax" value={selectedRow.evidence?.gateway_fee_paise !== undefined && selectedRow.evidence?.gateway_tax_paise !== undefined ? selectedRow.evidence.gateway_fee_paise + selectedRow.evidence.gateway_tax_paise : undefined} negative /><SourceAmount label="Refund debit" value={selectedRow.evidence?.refund_paise} negative /><SourceAmount label="Chargeback debit" value={selectedRow.evidence?.adjustment_paise} negative /><SourceAmount label="Reserve held" value={selectedRow.evidence?.reserve_hold_paise} negative /><SourceField label="Payment status" value={paymentStatus(selectedRow.evidence)} /><SourceField label="Description" value={selectedRow.evidence?.gateway_description} /><SourceField label="Notes" value={selectedRow.evidence?.gateway_notes} /></div>
          <div className="detail-source-card"><Text size="small">Bank statement</Text><SourceAvailability available={Boolean(selectedRow.settlementBatchBankPaise ?? selectedRow.evidence?.bank_credit_paise ?? selectedRow.utr)} missingLabel="No matching bank settlement found" /><SourceField label="Bank UTR" value={selectedRow.utr ?? selectedRow.evidence?.settlement_utr} /><SourceAmount label={selectedRow.settlementBatchOrderCount ? 'Batch credit received' : 'Credit received'} value={selectedRow.settlementBatchBankPaise ?? selectedRow.evidence?.bank_credit_paise} /><SourceField label="Narration" value={selectedRow.evidence?.bank_narration} /><SourceField label="Confidence" value={selectedRow.confidence} /></div>
        </div>
      </section>
    </main>;
  }
  return <main className="results">
    <Box display="flex" justifyContent="space-between" alignItems="flex-start" marginBottom="spacing.6">
      <Box><Text size="small">Settlement operations</Text><Heading size="xlarge" marginTop="spacing.2">Reconciliation dashboard</Heading><Text marginTop="spacing.2">Confirm settlement accuracy, understand exceptions, and prepare the records that need action.</Text></Box>
      <Button variant="primary" onClick={exportRows}>Export CSV</Button>
    </Box>
    {run.ai_status === 'quota_exceeded' ? <div className="ai-quota-notice"><Text weight="semibold">AI review paused: token quota reached</Text><Text size="small" marginTop="spacing.1">Some ambiguous exceptions were not sent for AI analysis and are marked for human review. Retry after the Gemini quota resets.</Text></div> : null}
    <div className="review-financial-grid">
      <SummaryCard label="Gross order value" value={run.summary.gross_order_paise} detail={`${run.total_orders} orders`} />
      <SummaryCard label="Net expected settlement" value={run.summary.net_settlement_paise} detail={`${run.summary.settlement_batch_count} settlement batches`} />
      <SummaryCard label="Bank credits received" value={run.summary.bank_credit_paise} detail="Statement credits" />
      <SummaryCard label="Unexplained exposure" value={run.summary.exception_value_paise} detail={`${run.quarantined.length} items need review`} tone="negative" />
    </div>
    <section className="review-pipeline-section">
      <Box marginBottom="spacing.4"><Heading size="medium">Reconciliation pipeline</Heading><Text size="small" marginTop="spacing.1">Select an outcome to view its records.</Text></Box>
      <div className="review-pipeline">
        <PipelineStage label="Imported" value={run.summary.total_orders} detail={run.summary.gross_order_paise} />
        <PipelineStage label="Matched" value={run.reconciled.length} detail={run.reconciled.reduce((sum, item) => sum + item.bank_credit_paise, 0)} tone="positive" />
        <PipelineStage label="Auto-resolved" value={run.ai_resolved.length} detail={run.ai_resolved.reduce((sum, item) => sum + Math.abs(item.delta_paise), 0)} tone="notice" />
        <PipelineStage label="Needs review" value={run.quarantined.length} detail={run.quarantined.reduce((sum, item) => sum + Math.abs(item.delta_paise), 0)} tone="negative" />
      </div>
    </section>
    <div className="review-analysis-grid">
      <section className="review-breakdown-section">
        <Heading size="medium">Exception exposure</Heading>
        <Text size="small" marginTop="spacing.1">Open variance grouped by root cause.</Text>
        <div className="exception-breakdown">{run.summary.exception_categories.map((category) => <div className="exception-breakdown-row" key={category.reason}><Box display="flex" justifyContent="space-between" alignItems="center"><Text>{readableReason(category.reason)}</Text><Box display="flex" alignItems="center" gap="spacing.1"><CurrencyText value={category.amount_paise} color="negative" /><Text size="small">· {category.count}</Text></Box></Box><div className="exception-breakdown-bar"><span style={{ width: `${run.summary.exception_value_paise ? Math.max(4, (category.amount_paise / run.summary.exception_value_paise) * 100) : 0}%` }} /></div></div>)}</div>
      </section>
      <section className="review-control-section">
        <Heading size="medium">Control checks</Heading>
        <Text size="small" marginTop="spacing.1">Financial checks that affect close readiness.</Text>
        <div className="review-check-list">
          <CheckRow label="Gateway to bank variance" value={formatPaise(run.summary.variance_paise)} negative={run.summary.variance_paise !== 0} />
          <CheckRow label="Settlement batches with mismatch" value={String(run.summary.mismatched_batch_count)} negative={run.summary.mismatched_batch_count > 0} />
          <CheckRow label="Gateway fees and tax captured" value={formatPaise(run.summary.gateway_fee_paise + run.summary.gateway_tax_paise)} />
        </div>
      </section>
    </div>
    <section className="review-records-section">
     <Table data={{ nodes: filteredRows }} rowDensity="compact" showBorderedCells gridTemplateColumns="1.1fr 1.45fr 1.55fr 2.1fr 0.9fr" toolbar={<TableToolbar title={`${filteredRows.length} of ${rows.length} records`}><TableToolbarActions><div className="review-table-toolbar-controls"><Box display="flex" alignItems="center" gap="spacing.3" flexWrap="nowrap"><SearchInput label="" accessibilityLabel="Search records" placeholder="Search customer, vendor, order ID, or UTR" value={query} onChange={({ value }) => setQuery(value ?? '')} onClearButtonClick={() => setQuery('')} /><Dropdown selectionType="single"><FilterChipSelectInput label="Review status" value={statusFilter === 'All' ? undefined : statusFilter} showClearButton={statusFilter !== 'All'} onChange={({ values }) => { setStatusFilter(values[0] as ReviewWorkflowStatus); setCategoryFilter(null); }} onClearButtonClick={() => setStatusFilter('All')} /><DropdownOverlay><ActionList><ActionListItem title="All records" value="All" /><ActionListItem title="Open" value="Open" /><ActionListItem title="In review" value="In review" /><ActionListItem title="Resolved" value="Resolved" /></ActionList></DropdownOverlay></Dropdown><Dropdown selectionType="single"><FilterChipSelectInput label="Root cause" value={categoryFilter ? readableReason(categoryFilter) : undefined} showClearButton={Boolean(categoryFilter)} onChange={({ values }) => { const value = values[0]; const category = run.summary.exception_categories.find((item) => readableReason(item.reason) === value); setCategoryFilter(category?.reason ?? null); setStatusFilter('All'); }} onClearButtonClick={() => setCategoryFilter(null)} /><DropdownOverlay><ActionList>{run.summary.exception_categories.map((category) => <ActionListItem key={category.reason} title={readableReason(category.reason)} value={readableReason(category.reason)} />)}</ActionList></DropdownOverlay></Dropdown>{(query || statusFilter !== 'All' || categoryFilter) ? <Button variant="tertiary" onClick={clearFilters}>Clear</Button> : null}</Box></div></TableToolbarActions></TableToolbar>}>{(tableRows) => <><TableHeader><TableHeaderRow><TableHeaderCell headerKey="status">Outcome</TableHeaderCell><TableHeaderCell headerKey="customer">Customer</TableHeaderCell><TableHeaderCell headerKey="vendor">Vendor</TableHeaderCell><TableHeaderCell headerKey="reference">Reference</TableHeaderCell><TableHeaderCell headerKey="amount" textAlign="right">Amount</TableHeaderCell></TableHeaderRow></TableHeader><TableBody>{tableRows.map((row) => <TableRow key={row.id} item={row} onClick={({ item }) => { setReviewNote(reviewNotes[item.id] ?? ''); setSelectedRow(item); }}><TableCell><div className="table-outcome-cell"><Badge color={statusColor(row.status)}>{row.status}</Badge>{row.status === 'Needs review' ? <Badge color={workflowStatusColor(reviewWorkflowStatus(row, reviewDecisions))}>{reviewWorkflowStatus(row, reviewDecisions)}</Badge> : null}</div></TableCell><TableCell><div className="table-text-cell"><Text>{row.customerName ?? 'Not available'}</Text></div></TableCell><TableCell><div className="table-text-cell"><Text>{row.vendorName ?? 'Not available'}</Text></div></TableCell><TableCell><div className="table-reference-cell"><Text size="small">{row.reference}</Text>{row.status !== 'Reconciled' ? <Badge color="neutral">{readableReason(row.detail)}</Badge> : null}</div></TableCell><TableCell textAlign="right"><CurrencyText value={Math.round(parseAmount(row.amount) * 100)} /></TableCell></TableRow>)}</TableBody></>}</Table>
    </section>
  </main>;
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: 'positive' | 'notice' | 'negative' }) {
  const color = tone === 'negative' ? 'negative' : label === 'Bank credits received' ? 'positive' : undefined;
  return <div className="review-metric"><Text size="small">{label}</Text><Box marginTop="spacing.2"><CurrencyText value={value} variant="large" color={color} /></Box><Box marginTop="spacing.2">{tone ? <Badge color={tone}>{detail}</Badge> : <Text size="small">{detail}</Text>}</Box></div>;
}

function PipelineStage({ label, value, detail, tone }: { label: string; value: number; detail: number; tone?: 'positive' | 'notice' | 'negative' }) {
  const color = tone === 'positive' ? 'positive' : tone === 'negative' ? 'negative' : tone === 'notice' ? 'notice' : undefined;
  return <div className="pipeline-stage"><Box display="flex" justifyContent="space-between" alignItems="center"><Text>{label}</Text>{tone ? <Badge color={tone}>{String(value)}</Badge> : <Text>{String(value)}</Text>}</Box><Box marginTop="spacing.2"><CurrencyText value={detail} variant="small" color={color} /></Box></div>;
}

function CheckRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return <div className="review-check-row"><Text size="small">{label}</Text><Badge color={negative ? 'negative' : 'positive'}>{value}</Badge></div>;
}

function FinancialLine({ label, value, negative, emphasis, color }: { label: string; value?: number; negative?: boolean; emphasis?: boolean; color?: 'positive' | 'negative' }) {
  return <div className={`detail-financial-line${emphasis ? ' detail-financial-line-total' : ''}`}><Text size="small">{label}</Text>{value === undefined ? <Text size="small">Not available</Text> : <CurrencyText value={negative ? -Math.abs(value) : value} color={color ?? (negative ? 'negative' : undefined)} />}</div>;
}

function SourceField({ label, value }: { label: string; value?: string }) {
  return <div className="source-field"><Text size="small">{label}</Text><Text marginTop="spacing.1">{value ?? 'Not available'}</Text></div>;
}

function AutomatedChecks() {
  return <div className="review-action-list"><Text size="small">Automated checks</Text><div className="automated-check"><span className="automated-check-status automated-check-failed">!</span><Text size="small">Gateway exact order ID match: not found</Text></div><div className="automated-check"><span className="automated-check-status automated-check-pending">→</span><Text size="small">Gateway amount/customer search: needs live Razorpay access or a refreshed report</Text></div><div className="automated-check"><span className="automated-check-status automated-check-pending">→</span><Text size="small">Bank UTR lookup: waiting for a settlement UTR</Text></div><div className="automated-check"><span className="automated-check-status automated-check-failed">!</span><Text size="small">Safe outcome: keep open until a payment or confirmed absence is evidenced</Text></div></div>;
}

function SourceAvailability({ available, missingLabel = 'No matching source record found' }: { available: boolean; missingLabel?: string }) {
  return <div className={`source-availability${available ? ' source-availability-found' : ' source-availability-missing'}`}><span aria-hidden="true">{available ? '●' : '!'}</span>{available ? 'Source record found' : missingLabel}</div>;
}

function SourceAmount({ label, value, negative }: { label: string; value?: number; negative?: boolean }) {
  return <div className="source-field"><Text size="small">{label}</Text>{value === undefined ? <Text marginTop="spacing.1">Not available</Text> : <Box marginTop="spacing.1"><CurrencyText value={negative ? -Math.abs(value) : value} color={negative ? 'negative' : undefined} /></Box>}</div>;
}

function CurrencyText({ value, variant = 'body', color }: { value: number; variant?: 'body' | 'small' | 'large'; color?: 'positive' | 'negative' | 'notice' }) {
 return <span className={`currency-text currency-text-${variant}${color ? ` currency-text-${color}` : ''}`}>{formatPaise(value)}</span>;
}

function reviewNotePlaceholder(row: ReviewRow): string {
  if (row.detail === 'CHARGEBACK_CLAWBACK') return 'e.g. Dispute DSP-123 confirmed lost; chargeback debit accepted on 05 Sep';
  if (row.detail === 'ORPHAN_BANK_CREDIT') return 'e.g. Matched to settlement UTR and posted to Razorpay clearing';
  if (row.detail === 'AMOUNT_MISMATCH') return 'e.g. Confirmed gateway overstatement of ₹1; correction requested from Razorpay';
  return 'Explain the evidence or decision';
}

function parseAmount(value: string): number {
  const numericValue = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function readableReason(reason: string): string {
  return reason.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusColor(status: ReviewRow['status']): 'positive' | 'notice' | 'negative' {
  return status === 'Reconciled' ? 'positive' : status === 'Auto-resolved' ? 'notice' : 'negative';
}

function csvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
