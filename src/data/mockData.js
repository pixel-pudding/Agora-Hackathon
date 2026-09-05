export const mockIncidentData = {
  incident: {
    id: "INC-8492",
    title: "Payment Service Outage",
    severity: "HIGH",
    status: "ACTIVE",
    service: "payments-core-api",
    environment: "Production (us-east-1)",
    startedAt: "10:31 AM",
    duration: "14m 22s",
    commander: "EchoOps Voice AI (Agent #07)",
    impact: "78% Checkout Transactions Failing",
    slaTimeRemaining: "11m 38s",
    estimatedRevenueImpact: "$48,200",
    impactedCustomers: "~1,420 users",
    summary: "High rate of HTTP 504 Gateway Timeouts and elevated API latency observed across checkout endpoints. Database worker connection pool is currently saturated."
  },

  timeline: [
    {
      id: "t1",
      time: "10:31 AM",
      title: "Payment API latency increased",
      description: "p99 latency spiked from 140ms to 4,800ms across payment gateway ingress routes.",
      source: "Datadog Telemetry",
      type: "alert",
      badge: "LATENCY SPIKE"
    },
    {
      id: "t2",
      time: "10:31 AM",
      title: "Multiple payment requests failing",
      description: "HTTP 504 Gateway Timeouts exceeded 70% threshold for Stripe and PayPal endpoints.",
      source: "API Ingress Monitor",
      type: "error",
      badge: "504 ERRORS"
    },
    {
      id: "t3",
      time: "10:32 AM",
      title: "Incident detected",
      description: "EchoOps Voice AI opened war room #042, paged on-call engineers, and initiated audio bridge.",
      source: "EchoOps AI Commander",
      type: "system",
      badge: "INCIDENT OPENED"
    },
    {
      id: "t4",
      time: "10:32 AM",
      title: "Payment service marked unavailable",
      description: "Synthetic health checks failed 3 consecutive rounds. Traffic shedding initiated.",
      source: "Consul Health Check",
      type: "warning",
      badge: "SERVICE DOWN"
    },
    {
      id: "t5",
      time: "10:33 AM",
      title: "Recovery action assigned",
      description: "EchoOps synthesized voice input from Tech Lead and assigned DB pool flush + rollback prep.",
      source: "Voice AI Synthesizer",
      type: "action",
      badge: "ACTION ASSIGNED"
    }
  ],

  facts: [
    {
      id: "f1",
      fact: "Database connection pool saturated (100/100 active connections locked).",
      verifiedBy: "Postgres APM / Sarah J.",
      timestamp: "10:33 AM",
      confidence: "Confirmed"
    },
    {
      id: "f2",
      fact: "Checkout endpoint /v2/checkout/process returning HTTP 504 to 78% of incoming traffic.",
      verifiedBy: "Cloudflare Ingress Logs",
      timestamp: "10:32 AM",
      confidence: "Confirmed"
    },
    {
      id: "f3",
      fact: "Payment Service deployment v2.4.1 was rolled out at 10:28 AM, 3 minutes before incident start.",
      verifiedBy: "GitHub Actions / ArgoCD",
      timestamp: "10:32 AM",
      confidence: "Confirmed"
    },
    {
      id: "f4",
      fact: "Third-party Stripe API status is green (100% operational; no external provider fault).",
      verifiedBy: "Stripe Webhook Monitor",
      timestamp: "10:34 AM",
      confidence: "Confirmed"
    }
  ],

  assumptions: [
    {
      id: "a1",
      hypothesis: "Stale worker connection locks are failing to terminate upon client timeout in v2.4.1.",
      source: "Suggested by Voice AI from stack trace analysis",
      status: "Unconfirmed Hypothesis",
      riskLevel: "High"
    },
    {
      id: "a2",
      hypothesis: "Rolling back immediately to v2.4.0 will clear the thread queue without needing a cold database reboot.",
      source: "Discussed on Voice Bridge by Alex Chen",
      status: "Pending Validation",
      riskLevel: "Medium"
    },
    {
      id: "a3",
      hypothesis: "Redis distributed cache sync lock is causing cascading backpressure to checkout workers.",
      source: "Automated Hypothesis & Telemetry Correlation",
      status: "Investigating",
      riskLevel: "Medium"
    }
  ],

  actions: [
    {
      id: "act-1",
      action: "Drain incoming checkout traffic to failover standby cluster",
      owner: {
        name: "Alex Chen",
        role: "Site Reliability Eng",
        initials: "AC",
        color: "#2563eb",
        bg: "#dbeafe"
      },
      status: "COMPLETED",
      updatedAt: "10:33 AM"
    },
    {
      id: "act-2",
      action: "Inspect PostgreSQL connection pool metrics & kill orphaned idle queries",
      owner: {
        name: "Sarah Jenkins",
        role: "Lead Database DBA",
        initials: "SJ",
        color: "#7c3aed",
        bg: "#ede9fe"
      },
      status: "IN PROGRESS",
      updatedAt: "10:34 AM"
    },
    {
      id: "act-3",
      action: "Prepare artifact rollback to stable version v2.4.0 in ArgoCD pipeline",
      owner: {
        name: "Elena Rostova",
        role: "Release & Deployment Eng",
        initials: "ER",
        color: "#d97706",
        bg: "#fef3c7"
      },
      status: "IN PROGRESS",
      updatedAt: "10:35 AM"
    },
    {
      id: "act-4",
      action: "Verify Stripe webhook idempotency reconciliation for dropped transactions",
      owner: {
        name: "Marcus Brody",
        role: "Backend Platform Eng",
        initials: "MB",
        color: "#059669",
        bg: "#d1fae5"
      },
      status: "PENDING",
      updatedAt: "10:35 AM"
    }
  ],

  alerts: {
    conflict: {
      type: "Conflict",
      badge: "CONCURRENT ACTION CONFLICT",
      title: "Concurrent Deployment Collision Detected",
      description: "Elena is preparing a manual v2.4.0 rollback while automated pipeline is retrying v2.4.1 hotfix deploy. Recommendation: Pause CI/CD runner #184.",
      impact: "High risk of overwriting rollback pod states and conflicting database migrations.",
      time: "10:34 AM",
      severity: "High"
    },
    gap: {
      type: "Gap",
      badge: "UNASSIGNED RESPONSIBILITY GAP",
      title: "Missing Primary Database DBA on Voice Bridge",
      description: "Postgres locks require root DBA authorization, but Primary DBA on-call has not yet joined the audio bridge. Backup DBA Sarah Jenkins is currently covering.",
      impact: "Potential delay in executing manual connection pool purge command.",
      time: "10:33 AM",
      severity: "Medium"
    },
    risk: {
      type: "Risk",
      badge: "SLA & BUSINESS RISK",
      title: "Tier-1 SLA Threshold Breach in 11 Minutes",
      description: "Tier-1 merchant checkout SLA guarantees 99.9% uptime. Continued 504 errors will trigger contractual SLA breach penalties if not resolved by 10:45 AM.",
      impact: "Financial penalty risk + automated executive escalation pager.",
      time: "10:35 AM",
      severity: "Critical"
    }
  },

  humanInTheLoop: {
    actionTitle: "Restart payment service",
    actionSub: "Cluster Worker Node Reset & Redis Connection Pool Flush",
    targetCluster: "prod-us-east1-payment-worker-pool-a",
    consequence: "Will safely terminate stuck connection pool and recycle 8 worker pods. In-flight requests will be re-routed to standby queue with zero data loss.",
    requiresApprovalBy: "Incident Commander (Human)",
    riskLevel: "CRITICAL RECOVERY"
  },

  voiceStreamMock: [
    { speaker: "EchoOps AI Commander", time: "10:34:10 AM", text: "Possible cause: The latency spike occurred shortly after the v2.4.1 deployment. Root cause is not confirmed." },
    { speaker: "Alex Chen (SRE)", time: "10:34:25 AM", text: "Standby cluster is warm. Ingress traffic has been 100% drained." },
    { speaker: "Sarah Jenkins (DBA)", time: "10:34:40 AM", text: "Identified 84 hung queries. Requesting commander confirmation to execute payment service restart." }
  ]
};
