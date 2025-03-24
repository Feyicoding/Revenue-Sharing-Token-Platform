;; Revenue-Sharing Token Platform
;; A platform for businesses to tokenize future revenue streams

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-authorized (err u101))
(define-constant err-project-exists (err u102))
(define-constant err-project-not-found (err u103))
(define-constant err-invalid-parameters (err u104))
(define-constant err-insufficient-funds (err u105))
(define-constant err-exceeds-allocation (err u106))
(define-constant err-project-not-active (err u107))
(define-constant err-verification-failed (err u108))
(define-constant err-verification-period-active (err u109))
(define-constant err-verification-period-ended (err u110))
(define-constant err-already-claimed (err u111))
(define-constant err-nothing-to-claim (err u112))
(define-constant err-not-within-trading-window (err u113))
(define-constant err-trade-limit-exceeded (err u114))
(define-constant err-order-not-found (err u115))
(define-constant err-self-trade (err u116))
(define-constant err-price-mismatch (err u117))
(define-constant err-verification-in-progress (err u118))
(define-constant err-invalid-order-state (err u119))
(define-constant err-token-transfer-failed (err u120))
(define-constant err-fee-payment-failed (err u121))
(define-constant err-exceeds-platform-limit (err u122))
(define-constant err-invalid-audit-data (err u123))
(define-constant err-audit-in-progress (err u124))
(define-constant err-invalid-report-period (err u125))

;; Platform parameters
(define-data-var next-project-id uint u1)
(define-data-var next-report-id uint u1)
(define-data-var next-order-id uint u1)
(define-data-var next-audit-id uint u1)
(define-data-var platform-fee-percentage uint u200) ;; 2% (basis points)
(define-data-var verification-period uint u72) ;; ~12 hours (assuming 6 blocks/hour)
(define-data-var min-verification-threshold uint u3) ;; Minimum verifiers needed
(define-data-var max-token-supply uint u100000000000) ;; 1 trillion tokens max
(define-data-var treasury-address principal contract-owner)
(define-data-var emergency-halt bool false)
(define-data-var platform-token-supply uint u1000000000) ;; 1 billion platform tokens

;; Platform token for governance and staking
(define-fungible-token platform-token)

;; Project status enumeration
;; 0 = Draft, 1 = Active, 2 = Paused, 3 = Closed, 4 = Default
(define-data-var project-statuses (list 5 (string-ascii 10)) (list "Draft" "Active" "Paused" "Closed" "Default"))

;; Revenue report status enumeration
;; 0 = Submitted, 1 = Verification, 2 = Disputed, 3 = Verified, 4 = Rejected
(define-data-var report-statuses (list 5 (string-ascii 12)) (list "Submitted" "Verification" "Disputed" "Verified" "Rejected"))

;; Order status enumeration
;; 0 = Open, 1 = Filled, 2 = Cancelled, 3 = Expired
(define-data-var order-statuses (list 4 (string-ascii 10)) (list "Open" "Filled" "Cancelled" "Expired"))

;; Audit status enumeration
;; 0 = Pending, 1 = In Progress, 2 = Completed, 3 = Failed
(define-data-var audit-statuses (list 4 (string-ascii 12)) (list "Pending" "InProgress" "Completed" "Failed"))

;; Project structure
(define-map projects
  { project-id: uint }
  {
    name: (string-ascii 64),
    description: (string-utf8 256),
    creator: principal,
    token-symbol: (string-ascii 10),
    total-supply: uint,
    tokens-issued: uint,
    revenue-percentage: uint, ;; Percentage of revenue allocated to token holders (basis points)
    revenue-period: uint, ;; In blocks (e.g., 8640 for monthly at 6 blocks/hour)
    duration: uint, ;; Total duration in blocks
    start-block: uint,
    end-block: uint,
    status: uint,
    total-revenue-collected: uint,
    total-revenue-distributed: uint,
    last-report-block: uint,
    creation-block: uint,
    token-price: uint, ;; Initial token price in microstacks
    min-investment: uint,
    max-investment: uint,
    trading-enabled: bool,
    trading-start-block: uint,
    trading-fee: uint, ;; In basis points
    metadata-url: (string-utf8 256),
    category: (string-ascii 32),
    verifiers: (list 10 principal)
  }
)

;; Map of project tokens
(define-map project-tokens
  { project-id: uint }
  { token-id: uint }
)

;; Token balances for all projects
(define-map token-balances
  { project-id: uint, owner: principal }
  { amount: uint }
)

;; Revenue reports
(define-map revenue-reports
  { report-id: uint }
  {
    project-id: uint,
    amount: uint,
    period-start: uint,
    period-end: uint,
    submission-block: uint,
    status: uint,
    verification-end-block: uint,
    verifications: (list 10 {
      verifier: principal,
      approved: bool,
      timestamp: uint,
      comments: (string-utf8 128)
    }),
    distribution-completed: bool,
    supporting-documents: (list 5 (string-utf8 256)),
    distribution-block: (optional uint),
    disputed-by: (optional principal)
  }
)

;; Project report indices
(define-map project-reports
  { project-id: uint }
  { report-ids: (list 100 uint) }
)

;; Revenue distribution claims
(define-map revenue-claims
  { report-id: uint, token-holder: principal }
  {
    amount: uint,
    claimed: bool,
    claim-block: (optional uint)
  }
)

;; Secondary market orders
(define-map market-orders
  { order-id: uint }
  {
    project-id: uint,
    seller: principal,
    token-amount: uint,
    price-per-token: uint,
    total-price: uint,
    creation-block: uint,
    expiration-block: uint,
    status: uint,
    buyer: (optional principal),
    execution-block: (optional uint),
    platform-fee: uint,
    creator-fee: uint
  }
)

;; User orders index
(define-map user-orders
  { user: principal }
  { order-ids: (list 100 uint) }
)

;; Project orders index
(define-map project-orders
  { project-id: uint }
  { order-ids: (list 200 uint) }
)

;; Audit records
(define-map audits
  { audit-id: uint }
  {
    project-id: uint,
    auditor: principal,
    audit-type: (string-ascii 20), ;; "financial", "technical", "compliance"
    start-block: uint,
    completion-block: (optional uint),
    status: uint,
    findings: (list 10 {
      category: (string-ascii 20),
      severity: uint, ;; 1-5 scale
      description: (string-utf8 256),
      recommendation: (string-utf8 256)
    }),
    report-url: (optional (string-utf8 256)),
    summary: (string-utf8 256)
  }
)

;; Project audits index
(define-map project-audits
  { project-id: uint }
  { audit-ids: (list 50 uint) }
)

;; Authorized verifiers
(define-map authorized-verifiers
  { verifier: principal }
  {
    authorized: bool,
    verification-count: uint,
    staked-amount: uint,
    accuracy-score: uint, ;; 0-100
    specialties: (list 5 (string-ascii 32)),
    last-active: uint
  }
)

;; Initialize platform
(define-public (initialize (treasury principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set treasury-address treasury)
    (var-set platform-fee-percentage u200) ;; 2%
    (var-set verification-period u72) ;; ~12 hours
    (var-set min-verification-threshold u3)
    (var-set emergency-halt false)
    
    ;; Mint platform tokens
    (try! (ft-mint? platform-token (var-get platform-token-supply) treasury))
    
    (ok true)
  )
)

;; Create a new revenue-sharing project
(define-public (create-project
  (name (string-ascii 64))
  (description (string-utf8 256))
  (token-symbol (string-ascii 10))
  (total-supply uint)
  (revenue-percentage uint)
  (revenue-period uint)
  (duration uint)
  (token-price uint)
  (min-investment uint)
  (max-investment uint)
  (trading-enabled bool)
  (trading-delay uint)
  (trading-fee uint)
  (metadata-url (string-utf8 256))
  (category (string-ascii 32))
  (verifiers (list 10 principal)))
  
  (let (
    (project-id (var-get next-project-id))
    (creator tx-sender)
    (now block-height)
  )
    ;; Parameter validation
    (asserts! (> total-supply u0) err-invalid-parameters)
    (asserts! (<= total-supply (var-get max-token-supply)) err-exceeds-platform-limit)
    (asserts! (> token-price u0) err-invalid-parameters)
    (asserts! (<= revenue-percentage u10000) err-invalid-parameters) ;; Max 100%
    (asserts! (> revenue-period u0) err-invalid-parameters)
    (asserts! (> duration revenue-period) err-invalid-parameters)
    (asserts! (<= trading-fee u1000) err-invalid-parameters) ;; Max 10%
    (asserts! (>= (len verifiers) (var-get min-verification-threshold)) err-invalid-parameters)
    
    ;; Verify all verifiers are authorized
    (asserts! (all-verifiers-authorized verifiers) err-not-authorized)
    
    ;; Create the project
    (map-set projects
      { project-id: project-id }
      {
        name: name,
        description: description,
        creator: creator,
        token-symbol: token-symbol,
        total-supply: total-supply,
        tokens-issued: u0,
        revenue-percentage: revenue-percentage,
        revenue-period: revenue-period,
        duration: duration,
        start-block: now,
        end-block: (+ now duration),
        status: u1, ;; Active
        total-revenue-collected: u0,
        total-revenue-distributed: u0,
        last-report-block: now,
        creation-block: now,
        token-price: token-price,
        min-investment: min-investment,
        max-investment: max-investment,
        trading-enabled: trading-enabled,
        trading-start-block: (+ now trading-delay),
        trading-fee: trading-fee,
        metadata-url: metadata-url,
        category: category,
        verifiers: verifiers
      }
    )
    
    ;; Initialize project reports list
    (map-set project-reports
      { project-id: project-id }
      { report-ids: (list) }
    )
    
    ;; Initialize project audit list
    (map-set project-audits
      { project-id: project-id }
      { audit-ids: (list) }
    )
    
    ;; Initialize creator token balance
    (map-set token-balances
      { project-id: project-id, owner: creator }
      { amount: u0 }
    )
    
    ;; Increment project ID counter
    (var-set next-project-id (+ project-id u1))
    
    (ok project-id)
  )
)

;; Helper to check if all verifiers are authorized
(define-private (all-verifiers-authorized (verifiers (list 10 principal)))
  (fold check-verifier-authorized true verifiers)
)

;; Helper to check a single verifier's authorization
(define-private (check-verifier-authorized (result bool) (verifier principal))
  (and result (default-to false (get authorized (map-get? authorized-verifiers { verifier: verifier }))))
)

;; Buy tokens for a project
(define-public (buy-tokens (project-id uint) (token-amount uint))
  (let (
    (buyer tx-sender)
    (project (unwrap! (map-get? projects { project-id: project-id }) err-project-not-found))
    (total-supply (get total-supply project))
    (tokens-issued (get tokens-issued project))
    (remaining-tokens (- total-supply tokens-issued))
    (token-price (get token-price project))
    (total-cost (* token-amount token-price))
    (min-investment (get min-investment project))
    (max-investment (get max-investment project))
  )
    ;; Validation
    (asserts! (is-eq (get status project) u1) err-project-not-active) ;; Project must be active
    (asserts! (<= token-amount remaining-tokens) err-exceeds-allocation) ;; Can't exceed remaining tokens
    (asserts! (>= total-cost min-investment) err-invalid-parameters) ;; Must meet minimum investment
    (asserts! (<= total-cost max-investment) err-invalid-parameters) ;; Can't exceed maximum investment
    
    ;; Check buyer has enough funds
    (asserts! (>= (stx-get-balance buyer) total-cost) err-insufficient-funds)
    
    ;; Transfer payment to project creator with platform fee
    (let (
      (platform-fee (/ (* total-cost (var-get platform-fee-percentage)) u10000))
      (creator-amount (- total-cost platform-fee))
    )
      ;; Transfer fees
      (try! (stx-transfer? platform-fee buyer (var-get treasury-address)))
      (try! (stx-transfer? creator-amount buyer (get creator project)))
      
      ;; Update token balance
      (let (
        (current-balance (default-to { amount: u0 } (map-get? token-balances { project-id: project-id, owner: buyer })))
        (new-balance (+ (get amount current-balance) token-amount))
      )
        (map-set token-balances
          { project-id: project-id, owner: buyer }
          { amount: new-balance }
        )
      )
      
      ;; Update project tokens issued
      (map-set projects
        { project-id: project-id }
        (merge project { tokens-issued: (+ tokens-issued token-amount) })
      )
      
      (ok { tokens: token-amount, cost: total-cost, fee: platform-fee })
    )
  )
)
;; Report revenue for a project
(define-public (report-revenue 
  (project-id uint) 
  (amount uint) 
  (period-start uint) 
  (period-end uint)
  (supporting-docs (list 5 (string-utf8 256))))
  
  (let (
    (reporter tx-sender)
    (project (unwrap! (map-get? projects { project-id: project-id }) err-project-not-found))
    (creator (get creator project))
    (report-id (var-get next-report-id))
    (verification-end (+ block-height (var-get verification-period)))
  )
    ;; Validation
    (asserts! (is-eq reporter creator) err-not-authorized) ;; Only creator can report
    (asserts! (is-eq (get status project) u1) err-project-not-active) ;; Project must be active
    (asserts! (< block-height (get end-block project)) err-project-not-active) ;; Project must not have ended
    (asserts! (> period-end period-start) err-invalid-parameters) ;; Valid period
    (asserts! (<= period-end block-height) err-invalid-report-period) ;; Can't report future revenue
    (asserts! (> amount u0) err-invalid-parameters) ;; Amount must be positive
    
    ;; Ensure period doesn't overlap with previous reports
    (asserts! (>= period-start (get last-report-block project)) err-invalid-report-period)
    
    ;; Transfer the revenue share to the contract
    (let (
      (revenue-share (/ (* amount (get revenue-percentage project)) u10000))
    )
      ;; Transfer revenue share to contract
      (try! (stx-transfer? revenue-share reporter (as-contract tx-sender)))
      
      ;; Create the revenue report
      (map-set revenue-reports
        { report-id: report-id }
        {
          project-id: project-id,
          amount: amount,
          period-start: period-start,
          period-end: period-end,
          submission-block: block-height,
          status: u1, ;; Verification
          verification-end-block: verification-end,
          verifications: (list),
          distribution-completed: false,
          supporting-documents: supporting-docs,
          distribution-block: none,
          disputed-by: none
        }
      )
      
      ;; Add report to project reports
      (let (
        (project-report-list (get report-ids (default-to { report-ids: (list) } 
                                              (map-get? project-reports { project-id: project-id }))))
      )
        (map-set project-reports
          { project-id: project-id }
          { report-ids: (append project-report-list report-id) }
        )
      )
      
      ;; Update project
      (map-set projects
        { project-id: project-id }
        (merge project {
          total-revenue-collected: (+ (get total-revenue-collected project) amount),
          last-report-block: period-end
        })
      )
      
      ;; Increment report ID
      (var-set next-report-id (+ report-id u1))
      
      (ok { 
        report-id: report-id, 
        revenue-share: revenue-share, 
        verification-end: verification-end 
      })
    )
  )
)

;; Verify a revenue report
(define-public (verify-report (report-id uint) (approved bool) (comments (string-utf8 128)))
  (let (
    (verifier tx-sender)
    (report (unwrap! (map-get? revenue-reports { report-id: report-id }) err-report-not-found))
    (project-id (get project-id report))
    (project (unwrap! (map-get? projects { project-id: project-id }) err-project-not-found))
    (verifiers (get verifiers project))
    (verification-end (get verification-end-block report))
  )
    ;; Validation
    (asserts! (is-some (index-of verifiers verifier)) err-not-authorized) ;; Must be an authorized verifier
    (asserts! (is-eq (get status report) u1) err-verification-failed) ;; Report must be in verification state
    (asserts! (< block-height verification-end) err-verification-period-ended) ;; Verification period must be active
    
    ;; Check if verifier has already verified
    (asserts! (is-none (find-verifier (get verifications report) verifier)) err-already-claimed)
    
    ;; Add verification
    (let (
      (current-verifications (get verifications report))
      (new-verification {
        verifier: verifier,
        approved: approved,
        timestamp: block-height,
        comments: comments
      })
      (updated-verifications (append current-verifications new-verification))
      (verifier-record (unwrap! (map-get? authorized-verifiers { verifier: verifier }) err-not-authorized))
    )
      ;; Update verifier stats
      (map-set authorized-verifiers
        { verifier: verifier }
        (merge verifier-record {
          verification-count: (+ (get verification-count verifier-record) u1),
          last-active: block-height
        })
      )
      
      ;; Update report
      (map-set revenue-reports
        { report-id: report-id }
        (merge report { verifications: updated-verifications })
      )
      
      ;; Check if enough verifications to finalize
      (if (>= (len updated-verifications) (var-get min-verification-threshold))
        (finalize-report report-id)
        (ok { report-id: report-id, status: "pending" })
      )
    )
  )
)

;; Helper to find a verifier in the verification list
(define-private (find-verifier 
  (verifications (list 10 { verifier: principal, approved: bool, timestamp: uint, comments: (string-utf8 128) }))
  (target-verifier principal))
  
  (filter is-target-verifier verifications)
)

;; Helper to check if verifier matches target
(define-private (is-target-verifier 
  (verification { verifier: principal, approved: bool, timestamp: uint, comments: (string-utf8 128) }))
  
  (is-eq (get verifier verification) target-verifier)
)

;; Finalize report after verification
(define-private (finalize-report (report-id uint))
  (let (
    (report (unwrap! (map-get? revenue-reports { report-id: report-id }) err-report-not-found))
    (verifications (get verifications report))
    (approvals (filter is-approval verifications))
    (approval-count (len approvals))
    (verification-count (len verifications))
    (approved (>= (* approval-count u100) (* verification-count u60))) ;; >60% approval rate
  )
    (if approved
      (let (
        (project-id (get project-id report))
        (project (unwrap! (map-get? projects { project-id: project-id }) err-project-not-found))
      )
        ;; Mark report as verified
        (map-set revenue-reports
          { report-id: report-id }
          (merge report { 
            status: u3, ;; Verified
            distribution-completed: false
          })
        )
        
        ;; Calculate and distribute revenue shares
        (distribute-revenue report-id)
      )
      ;; Mark report as rejected
      (begin
        (map-set revenue-reports
          { report-id: report-id }
          (merge report { 
            status: u4, ;; Rejected
            distribution-completed: false
          })
        )
        
        ;; Refund the escrowed revenue to the project creator
        (let (
          (project-id (get project-id report))
          (project (unwrap! (map-get? projects { project-id: project-id }) err-project-not-found))
          (amount (get amount report))
          (revenue-share (/ (* amount (get revenue-percentage project)) u10000))
        )
          (as-contract (stx-transfer? revenue-share (as-contract tx-sender) (get creator project)))
        )
        
        (ok { report-id: report-id, status: "rejected" })
      )
    )
  )
