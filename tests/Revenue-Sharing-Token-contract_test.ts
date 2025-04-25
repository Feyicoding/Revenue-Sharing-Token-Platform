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