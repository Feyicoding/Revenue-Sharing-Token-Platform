import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Helper for converting values to clarity values
const toBigInt = (value: number) => BigInt(value);

// Helper to get error codes from responses
function getErrCode(receipt: any): number {
  if (receipt.result.startsWith('(err ')) {
    const errValue = receipt.result.substring(5, receipt.result.length - 1);
    return parseInt(errValue.substring(1));
  }
  return -1;
}

Clarinet.test({
  name: "Ensure platform initialization works properly",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const treasury = accounts.get('wallet_1')!;
    
    // Call initialize
    let block = chain.mineBlock([
      Tx.contractCall('revenue-sharing-token-platform', 'initialize', [
        types.principal(treasury.address)
      ], deployer.address)
    ]);
    
    // Check transaction success
    assertEquals(block.receipts[0].result, '(ok true)');
    
    // Check platform parameters
    let platformParams = chain.callReadOnlyFn(
      'revenue-sharing-token-platform',
      'get-platform-parameters',
      [],
      deployer.address
    );
    
    // Verify parameter values
    const params = platformParams.result.expectTuple();
    assertEquals(params['platform-fee-percentage'], '200'); // 2%
    assertEquals(params['verification-period'], '72');
    assertEquals(params['min-verification-threshold'], '3');
    assertEquals(params['emergency-halt'], 'false');
  }
});

Clarinet.test({
  name: "Only contract owner can initialize platform",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const treasury = accounts.get('wallet_1')!;
    const nonOwner = accounts.get('wallet_2')!;
    
    // Non-owner tries to initialize
    let block = chain.mineBlock([
      Tx.contractCall('revenue-sharing-token-platform', 'initialize', [
        types.principal(treasury.address)
      ], nonOwner.address)
    ]);
    
    // Should fail with error 100 (err-owner-only)
    assertEquals(getErrCode(block.receipts[0]), 100);
  }
});

Clarinet.test({
  name: "Create project functionality works as expected",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const treasury = accounts.get('wallet_1')!;
    const projectCreator = accounts.get('wallet_2')!;
    const verifier1 = accounts.get('wallet_3')!;
    const verifier2 = accounts.get('wallet_4')!;
    const verifier3 = accounts.get('wallet_5')!;
    
    // Initialize platform
    chain.mineBlock([
      Tx.contractCall('revenue-sharing-token-platform', 'initialize', [
        types.principal(treasury.address)
      ], deployer.address)
    ]);
    
    // Authorize verifiers
    chain.mineBlock([
      Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
        types.principal(verifier1.address),
        types.list([types.ascii("finance"), types.ascii("technical")])
      ], deployer.address),
      Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
        types.principal(verifier2.address),
        types.list([types.ascii("finance"), types.ascii("compliance")])
      ], deployer.address),
      Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
        types.principal(verifier3.address),
        types.list([types.ascii("compliance"), types.ascii("technical")])
      ], deployer.address)
    ]);
    
    // Create project
    let block = chain.mineBlock([
      Tx.contractCall('revenue-sharing-token-platform', 'create-project', [
        types.ascii("Coffee Chain Revenue"), // name
        types.utf8("Revenue share for our coffee chain business"), // description
        types.ascii("COFFEE"), // token-symbol
        types.uint(10000000), // total-supply
        types.uint(2000), // revenue-percentage (20%)
        types.uint(4320), // revenue-period (1 month at 6 blocks/hour)
        types.uint(518400), // duration (2 years)
        types.uint(5000000), // token-price (0.05 STX)
        types.uint(50000000), // min-investment (50 STX)
        types.uint(5000000000), // max-investment (5000 STX)
        types.bool(true), // trading-enabled
        types.uint(8640), // trading-delay (1 week)
        types.uint(300), // trading-fee (3%)
        types.utf8("https://example.com/metadata"), // metadata-url
        types.ascii("food-beverage"), // category
        types.list([
          types.principal(verifier1.address),
          types.principal(verifier2.address),
          types.principal(verifier3.address)
        ]) // verifiers
      ], projectCreator.address)
    ]);
    
    // Check project creation success
    assertEquals(block.receipts[0].result, '(ok u1)');
    
    // Verify project details
    let projectInfo = chain.callReadOnlyFn(
      'revenue-sharing-token-platform',
      'get-project',
      [types.uint(1)],
      deployer.address
    );
    
    const project = projectInfo.result.expectSome().expectTuple();
    assertEquals(project['name'], 'Coffee Chain Revenue');
    assertEquals(project['token-symbol'], 'COFFEE');
    assertEquals(project['creator'], projectCreator.address);
    assertEquals(project['total-supply'], '10000000');
    assertEquals(project['revenue-percentage'], '2000');
    assertEquals(project['trading-enabled'], 'true');
  }
});

Clarinet.test({
    name: "Buy tokens functionality works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
      const deployer = accounts.get('deployer')!;
      const treasury = accounts.get('wallet_1')!;
      const projectCreator = accounts.get('wallet_2')!;
      const verifier1 = accounts.get('wallet_3')!;
      const verifier2 = accounts.get('wallet_4')!;
      const verifier3 = accounts.get('wallet_5')!;
      const investor = accounts.get('wallet_6')!;
      
      // Initialize platform and create project
      chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'initialize', [
          types.principal(treasury.address)
        ], deployer.address),
        
        // Authorize verifiers
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier1.address),
          types.list([types.ascii("finance"), types.ascii("technical")])
        ], deployer.address),
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier2.address),
          types.list([types.ascii("finance"), types.ascii("compliance")])
        ], deployer.address),
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier3.address),
          types.list([types.ascii("compliance"), types.ascii("technical")])
        ], deployer.address),
        
        // Create project
        Tx.contractCall('revenue-sharing-token-platform', 'create-project', [
          types.ascii("Coffee Chain Revenue"), // name
          types.utf8("Revenue share for our coffee chain business"), // description
          types.ascii("COFFEE"), // token-symbol
          types.uint(10000000), // total-supply
          types.uint(2000), // revenue-percentage (20%)
          types.uint(4320), // revenue-period (1 month at 6 blocks/hour)
          types.uint(518400), // duration (2 years)
          types.uint(1000000), // token-price (0.01 STX)
          types.uint(50000000), // min-investment (50 STX)
          types.uint(5000000000), // max-investment (5000 STX)
          types.bool(true), // trading-enabled
          types.uint(8640), // trading-delay (1 week)
          types.uint(300), // trading-fee (3%)
          types.utf8("https://example.com/metadata"), // metadata-url
          types.ascii("food-beverage"), // category
          types.list([
            types.principal(verifier1.address),
            types.principal(verifier2.address),
            types.principal(verifier3.address)
          ]) // verifiers
        ], projectCreator.address)
      ]);
      
      // Investor buys 1000 tokens (1 STX each)
      let block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'buy-tokens', [
          types.uint(1), // project_id
          types.uint(1000) // token_amount
        ], investor.address)
      ]);
      
      // Check transaction success
      const result = block.receipts[0].result.expectOk().expectTuple();
      assertEquals(result['tokens'], '1000');
      assertEquals(result['cost'], '1000000000'); // 1000 * 1000000 (1 STX per token)
      
      // Check investor's token balance
      let balanceInfo = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-token-balance',
        [types.uint(1), types.principal(investor.address)],
        deployer.address
      );
      
      const balance = balanceInfo.result.expectTuple();
      assertEquals(balance['amount'], '1000');
      
      // Check project's tokens issued
      let projectInfo = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-project',
        [types.uint(1)],
        deployer.address
      );
      
      const project = projectInfo.result.expectSome().expectTuple();
      assertEquals(project['tokens-issued'], '1000');
    }
  });
  
  Clarinet.test({
    name: "Report revenue and verify it works properly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
      const deployer = accounts.get('deployer')!;
      const treasury = accounts.get('wallet_1')!;
      const projectCreator = accounts.get('wallet_2')!;
      const verifier1 = accounts.get('wallet_3')!;
      const verifier2 = accounts.get('wallet_4')!;
      const verifier3 = accounts.get('wallet_5')!;
      const investor = accounts.get('wallet_6')!;
      
      // Setup platform, verifiers, project and buy tokens
      chain.mineBlock([
        // Initialize platform
        Tx.contractCall('revenue-sharing-token-platform', 'initialize', [
          types.principal(treasury.address)
        ], deployer.address),
        
        // Authorize verifiers
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier1.address),
          types.list([types.ascii("finance"), types.ascii("technical")])
        ], deployer.address),
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier2.address),
          types.list([types.ascii("finance"), types.ascii("compliance")])
        ], deployer.address),
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier3.address),
          types.list([types.ascii("compliance"), types.ascii("technical")])
        ], deployer.address),
        
        // Create project
        Tx.contractCall('revenue-sharing-token-platform', 'create-project', [
          types.ascii("Coffee Chain Revenue"), // name
          types.utf8("Revenue share for our coffee chain business"), // description
          types.ascii("COFFEE"), // token-symbol
          types.uint(10000000), // total-supply
          types.uint(2000), // revenue-percentage (20%)
          types.uint(4320), // revenue-period (1 month at 6 blocks/hour)
          types.uint(518400), // duration (2 years)
          types.uint(1000000), // token-price (0.01 STX)
          types.uint(50000000), // min-investment (50 STX)
          types.uint(5000000000), // max-investment (5000 STX)
          types.bool(true), // trading-enabled
          types.uint(8640), // trading-delay (1 week)
          types.uint(300), // trading-fee (3%)
          types.utf8("https://example.com/metadata"), // metadata-url
          types.ascii("food-beverage"), // category
          types.list([
            types.principal(verifier1.address),
            types.principal(verifier2.address),
            types.principal(verifier3.address)
          ]) // verifiers
        ], projectCreator.address),
        
        // Investor buys tokens
        Tx.contractCall('revenue-sharing-token-platform', 'buy-tokens', [
          types.uint(1), // project_id
          types.uint(1000) // token_amount
        ], investor.address)
      ]);
      
      // Project creator reports revenue
      let block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'report-revenue', [
          types.uint(1), // project_id
          types.uint(5000000000), // amount (5000 STX)
          types.uint(1), // period_start (block height)
          types.uint(10), // period_end (block height)
          types.list([types.utf8("https://example.com/revenue-docs")])
        ], projectCreator.address)
      ]);
      
      // Check report creation success
      const reportResult = block.receipts[0].result.expectOk().expectTuple();
      assertEquals(reportResult['report-id'], '1');
      
      // Verifiers verify the report
      block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'verify-report', [
          types.uint(1), // report_id
          types.bool(true), // approved
          types.utf8("Verified and looks good") // comments
        ], verifier1.address),
        
        Tx.contractCall('revenue-sharing-token-platform', 'verify-report', [
          types.uint(1), // report_id
          types.bool(true), // approved
          types.utf8("Confirmed with documentation") // comments
        ], verifier2.address),
        
        Tx.contractCall('revenue-sharing-token-platform', 'verify-report', [
          types.uint(1), // report_id
          types.bool(true), // approved
          types.utf8("All checks passed") // comments
        ], verifier3.address)
      ]);
      
      // All verifications should succeed
      assertEquals(block.receipts[0].result.expectOk().expectTuple()['report-id'], '1');
      assertEquals(block.receipts[1].result.expectOk().expectTuple()['report-id'], '1');
      
      // Third verification should trigger distribution
      const finalResult = block.receipts[2].result.expectOk().expectTuple();
      assertEquals(finalResult['report-id'], '1');
      assertEquals(finalResult['status'], 'distributed');
      
      // Check report status
      let reportStatus = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-report-status-string',
        [types.uint(1)],
        deployer.address
      );
      
      assertEquals(reportStatus.result, '"Verified"');
      
      // Investor claims revenue share
      block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'claim-revenue', [
          types.uint(1) // report_id
        ], investor.address)
      ]);
      
      // Check claim success
      const claimResult = block.receipts[0].result.expectOk().expectTuple();
      // The investor owns 1000 of 10,000,000 tokens (0.01%)
      // Revenue is 5000 STX * 20% = 1000 STX to distribute
      // Investor share should be 0.01% of 1000 STX = 0.1 STX = 100,000 microSTX
      assertEquals(claimResult['amount'], '100000');
    }
  });
  
  Clarinet.test({
    name: "Secondary market trading functionality works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
      const deployer = accounts.get('deployer')!;
      const treasury = accounts.get('wallet_1')!;
      const projectCreator = accounts.get('wallet_2')!;
      const verifier1 = accounts.get('wallet_3')!;
      const verifier2 = accounts.get('wallet_4')!;
      const verifier3 = accounts.get('wallet_5')!;
      const seller = accounts.get('wallet_6')!;
      const buyer = accounts.get('wallet_7')!;
      
      // Initialize platform and setup project
      chain.mineBlock([
        // Initialize platform
        Tx.contractCall('revenue-sharing-token-platform', 'initialize', [
          types.principal(treasury.address)
        ], deployer.address),
        
        // Authorize verifiers
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier1.address),
          types.list([types.ascii("finance"), types.ascii("technical")])
        ], deployer.address),
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier2.address),
          types.list([types.ascii("finance"), types.ascii("compliance")])
        ], deployer.address),
        Tx.contractCall('revenue-sharing-token-platform', 'authorize-verifier', [
          types.principal(verifier3.address),
          types.list([types.ascii("compliance"), types.ascii("technical")])
        ], deployer.address),
        
        // Create project with immediate trading (no delay)
        Tx.contractCall('revenue-sharing-token-platform', 'create-project', [
          types.ascii("Coffee Chain Revenue"), // name
          types.utf8("Revenue share for our coffee chain business"), // description
          types.ascii("COFFEE"), // token-symbol
          types.uint(10000000), // total-supply
          types.uint(2000), // revenue-percentage (20%)
          types.uint(4320), // revenue-period (1 month at 6 blocks/hour)
          types.uint(518400), // duration (2 years)
          types.uint(1000000), // token-price (0.01 STX)
          types.uint(50000000), // min-investment (50 STX)
          types.uint(5000000000), // max-investment (5000 STX)
          types.bool(true), // trading-enabled
          types.uint(0), // trading-delay (immediate)
          types.uint(300), // trading-fee (3%)
          types.utf8("https://example.com/metadata"), // metadata-url
          types.ascii("food-beverage"), // category
          types.list([
            types.principal(verifier1.address),
            types.principal(verifier2.address),
            types.principal(verifier3.address)
          ]) // verifiers
        ], projectCreator.address),
        
        // Seller buys tokens
        Tx.contractCall('revenue-sharing-token-platform', 'buy-tokens', [
          types.uint(1), // project_id
          types.uint(1000) // token_amount
        ], seller.address)
      ]);
      
      // Create sell order
      let block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'create-sell-order', [
          types.uint(1), // project_id
          types.uint(500), // token_amount
          types.uint(1500000), // price_per_token (0.015 STX - 50% markup)
          types.uint(100) // expiration_blocks
        ], seller.address)
      ]);
      
      // Check order creation success
      const orderResult = block.receipts[0].result.expectOk().expectTuple();
      assertEquals(orderResult['order-id'], '1');
      assertEquals(orderResult['token-amount'], '500');
      assertEquals(orderResult['total-price'], '750000000'); // 500 * 1.5 STX
      
      // Verify order details
      let orderInfo = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-market-order',
        [types.uint(1)],
        deployer.address
      );
      
      const order = orderInfo.result.expectSome().expectTuple();
      assertEquals(order['project-id'], '1');
      assertEquals(order['seller'], seller.address);
      assertEquals(order['token-amount'], '500');
      assertEquals(order['price-per-token'], '1500000');
      assertEquals(order['status'], '0'); // Open
      
      // Verify seller's token balance (locked 500 tokens)
      let sellerBalance = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-token-balance',
        [types.uint(1), types.principal(seller.address)],
        deployer.address
      );
      
      assertEquals(sellerBalance.result.expectTuple()['amount'], '500');
      
      // Buyer fills the order
      block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'fill-order', [
          types.uint(1) // order_id
        ], buyer.address)
      ]);
      
      // Check fill success
      const fillResult = block.receipts[0].result.expectOk().expectTuple();
      assertEquals(fillResult['order-id'], '1');
      
      // Verify updated order status
      orderInfo = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-market-order',
        [types.uint(1)],
        deployer.address
      );
      
      const updatedOrder = orderInfo.result.expectSome().expectTuple();
      assertEquals(updatedOrder['status'], '1'); // Filled
      assertEquals(updatedOrder['buyer'], buyer.address);
      
      // Verify buyer received tokens
      let buyerBalance = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-token-balance',
        [types.uint(1), types.principal(buyer.address)],
        deployer.address
      );
      
      assertEquals(buyerBalance.result.expectTuple()['amount'], '500');
    }
  });
  
  Clarinet.test({
    name: "Audit request and submission process works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
      const deployer = accounts.get('deployer')!;
      const treasury = accounts.get('wallet_1')!;
      const projectCreator = accounts.get('wallet_2')!;
      const auditor = accounts.get('wallet_3')!;
      
      // Initialize platform and create project
      chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'initialize', [
          types.principal(treasury.address)
        ], deployer.address),
        
        // Create project with minimal setup for this test
        Tx.contractCall('revenue-sharing-token-platform', 'create-project', [
          types.ascii("Coffee Chain Revenue"), // name
          types.utf8("Revenue share for our coffee chain business"), // description
          types.ascii("COFFEE"), // token-symbol
          types.uint(10000000), // total-supply
          types.uint(2000), // revenue-percentage (20%)
          types.uint(4320), // revenue-period
          types.uint(518400), // duration
          types.uint(1000000), // token-price
          types.uint(50000000), // min-investment
          types.uint(5000000000), // max-investment
          types.bool(true), // trading-enabled
          types.uint(0), // trading-delay
          types.uint(300), // trading-fee
          types.utf8("https://example.com/metadata"), // metadata-url
          types.ascii("food-beverage"), // category
          types.list([types.principal(deployer.address)]) // verifiers - just need one for this test
        ], projectCreator.address)
      ]);
      
      // Request audit
      let block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'request-audit', [
          types.uint(1), // project_id
          types.ascii("financial") // audit_type
        ], projectCreator.address)
      ]);
      
      // Check audit request success
      const auditResult = block.receipts[0].result.expectOk().expectTuple();
      assertEquals(auditResult['audit-id'], '1');
      
      // Verify audit details
      let auditInfo = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-audit',
        [types.uint(1)],
        deployer.address
      );
      
      const audit = auditInfo.result.expectSome().expectTuple();
      assertEquals(audit['project-id'], '1');
      assertEquals(audit['audit-type'], 'financial');
      assertEquals(audit['status'], '0'); // Pending
      
      // Check audit status string
      let auditStatus = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-audit-status-string',
        [types.uint(1)],
        deployer.address
      );
      
      assertEquals(auditStatus.result, '"Pending"');
      
      // Platform owner assigns auditor
      block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'assign-auditor', [
          types.uint(1), // audit_id
          types.principal(auditor.address)
        ], deployer.address)
      ]);
      
      // Check assignment success
      const assignResult = block.receipts[0].result.expectOk().expectTuple();
      assertEquals(assignResult['audit-id'], '1');
      assertEquals(assignResult['auditor'], auditor.address);
      
      // Auditor submits findings
      block = chain.mineBlock([
        Tx.contractCall('revenue-sharing-token-platform', 'submit-audit-findings', [
          types.uint(1), // audit_id
          types.list([
            types.tuple({
              'category': types.ascii("cash-flow"),
              'severity': types.uint(2),
              'description': types.utf8("Revenue calculation discrepancy"),
              'recommendation': types.utf8("Implement double-entry accounting")
            }),
            types.tuple({
              'category': types.ascii("reporting"),
              'severity': types.uint(1),
              'description': types.utf8("Minor reporting delay"),
              'recommendation': types.utf8("Ensure timely reporting")
            })
          ]), // findings
          types.utf8("https://example.com/audit-report"), // report_url
          types.utf8("Overall the financials look good with minor improvements needed") // summary
        ], auditor.address)
      ]);
      
      // Check submission success
      assertEquals(block.receipts[0].result, '(ok (audit-id u1))');
      
      // Verify updated audit status
      auditStatus = chain.callReadOnlyFn(
        'revenue-sharing-token-platform',
        'get-audit-status-string',
        [types.uint(1)],
        deployer.address
      );
      
      assertEquals(auditStatus.result, '"Completed"');
    }
  });
  
  Clarinet.test({
    name: "Verifier management and staking works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
      const deployer = accounts.get('deployer')!;
      const treasury = accounts.get('wallet_1')!;
      const verifier = accounts.get('wallet_2')!;
      
      // Initialize platform
      chain.mineBlock([
        Tx.contractCall(