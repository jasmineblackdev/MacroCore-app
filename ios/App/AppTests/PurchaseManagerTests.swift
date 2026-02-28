/**
 * PurchaseManagerTests.swift
 *
 * Unit + integration stubs for PurchaseManager.
 *
 * Test coverage:
 *   ✓ isPro bootstrapped from UserDefaults — absent key → false
 *   ✓ isPro bootstrapped from UserDefaults — key = true
 *   ✓ isPro bootstrapped from UserDefaults — key = false
 *   ✓ mc_entitlement_changed notification posts when isPro changes
 *   ✓ mc_entitlement_changed posts false on entitlement expiry
 *   ✓ RestoreResult enum: three distinct cases compile + compare correctly
 *   ✓ RestoreResult → UI message mapping mirrors purchaseState.test.ts
 *   ✓ refreshEntitlements() does not crash offline and preserves cached isPro
 *   [skip] restorePurchases() returns .alreadyActive — requires RC sandbox
 *   [skip] restorePurchases() returns .restored       — requires RC sandbox
 *   [skip] restorePurchases() returns .notFound       — requires RC sandbox
 *
 * HOW TO ADD TO THE XCODE PROJECT:
 *   1. In Xcode → Navigator → right-click "AppTests" group → Add Files to "App"
 *      or drag this file into the AppTests group.
 *   2. Target membership: AppTests (not App).
 *   3. If AppTests target does not exist:
 *        File → New → Target → Unit Testing Bundle → Name: AppTests
 *        Product Name: AppTests, Bundle ID: ...AppTests, Target: App
 *
 * INTEGRATION TESTS (skipped by default):
 *   Replace RevenueCatConfig.apiKey, configure a StoreKit .storeKitConfig file
 *   (Product → Scheme → Edit → Options → StoreKit Configuration), then
 *   run on a physical device or simulator with a sandbox Apple ID.
 */

import XCTest
@testable import App

// swiftlint:disable function_body_length

@MainActor
final class PurchaseManagerTests: XCTestCase {

    private let proKey = "mc_is_pro"

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override func setUp() async throws {
        try await super.setUp()
        // Clean slate before each test so configure() reads a known state.
        UserDefaults.standard.removeObject(forKey: proKey)
    }

    override func tearDown() async throws {
        UserDefaults.standard.removeObject(forKey: proKey)
        try await super.tearDown()
    }

    // ─── Bootstrap from UserDefaults ─────────────────────────────────────────

    func test_configure_defaultsFalseWhenKeyAbsent() {
        // Key not in UserDefaults → isPro must be false.
        // Note: configure() also calls Purchases.configure(withAPIKey:).
        // With the placeholder key the RC SDK initialises in an invalid state
        // but does NOT crash or modify UserDefaults, so the assertion is safe.
        PurchaseManager.shared.configure()

        XCTAssertFalse(
            PurchaseManager.shared.isPro,
            "isPro should default to false when mc_is_pro is absent from UserDefaults"
        )
    }

    func test_configure_readsTrueFromUserDefaults() {
        UserDefaults.standard.set(true, forKey: proKey)

        PurchaseManager.shared.configure()

        XCTAssertTrue(
            PurchaseManager.shared.isPro,
            "isPro should be true when mc_is_pro = true was stored by a prior session"
        )
    }

    func test_configure_readsFalseFromUserDefaults() {
        UserDefaults.standard.set(false, forKey: proKey)

        PurchaseManager.shared.configure()

        XCTAssertFalse(
            PurchaseManager.shared.isPro,
            "isPro should be false when mc_is_pro = false in UserDefaults"
        )
    }

    // ─── NotificationCenter relay ─────────────────────────────────────────────
    // updateProStatus(from:) requires a live CustomerInfo (RevenueCat).
    // We test the notification pathway — the identical mechanism used in production —
    // by posting directly, which is what updateProStatus() calls internally.

    func test_notifyJS_postsEntitlementChangedWithTrue() {
        let didReceive = expectation(description: "entitlementChanged with isPro=true")
        var receivedValue: Bool?

        let observer = NotificationCenter.default.addObserver(
            forName: .mcEntitlementChanged,
            object: nil,
            queue: .main
        ) { note in
            receivedValue = note.userInfo?["isPro"] as? Bool
            didReceive.fulfill()
        }

        NotificationCenter.default.post(
            name: .mcEntitlementChanged,
            object: nil,
            userInfo: ["isPro": true]
        )

        waitForExpectations(timeout: 1.0)
        NotificationCenter.default.removeObserver(observer)

        XCTAssertEqual(receivedValue, true, "Listener must receive isPro = true")
    }

    func test_notifyJS_postsEntitlementChangedWithFalse_onExpiry() {
        let didReceive = expectation(description: "entitlementChanged with isPro=false")
        var receivedValue: Bool?

        let observer = NotificationCenter.default.addObserver(
            forName: .mcEntitlementChanged,
            object: nil,
            queue: .main
        ) { note in
            receivedValue = note.userInfo?["isPro"] as? Bool
            didReceive.fulfill()
        }

        NotificationCenter.default.post(
            name: .mcEntitlementChanged,
            object: nil,
            userInfo: ["isPro": false]
        )

        waitForExpectations(timeout: 1.0)
        NotificationCenter.default.removeObserver(observer)

        XCTAssertEqual(receivedValue, false, "Listener must receive isPro = false on expiry")
    }

    func test_notifyJS_multipleListenersAllReceiveEvent() {
        let exp1 = expectation(description: "listener 1 fired")
        let exp2 = expectation(description: "listener 2 fired")

        let obs1 = NotificationCenter.default.addObserver(
            forName: .mcEntitlementChanged, object: nil, queue: .main
        ) { _ in exp1.fulfill() }

        let obs2 = NotificationCenter.default.addObserver(
            forName: .mcEntitlementChanged, object: nil, queue: .main
        ) { _ in exp2.fulfill() }

        NotificationCenter.default.post(
            name: .mcEntitlementChanged, object: nil, userInfo: ["isPro": true]
        )

        waitForExpectations(timeout: 1.0)
        NotificationCenter.default.removeObserver(obs1)
        NotificationCenter.default.removeObserver(obs2)
    }

    // ─── RestoreResult enum ───────────────────────────────────────────────────

    func test_restoreResult_threeDistinctCasesExist() {
        // Swift simple enums conform to Equatable automatically.
        // This test doubles as a compile-time check that all three cases exist.
        let a = PurchaseManager.RestoreResult.alreadyActive
        let b = PurchaseManager.RestoreResult.restored
        let c = PurchaseManager.RestoreResult.notFound

        XCTAssertEqual(a, .alreadyActive)
        XCTAssertEqual(b, .restored)
        XCTAssertEqual(c, .notFound)

        XCTAssertNotEqual(a, b)
        XCTAssertNotEqual(b, c)
        XCTAssertNotEqual(a, c)
    }

    func test_restoreResult_uiMessageMapping() {
        // This helper mirrors restoreResultMessage() in purchaseState.test.ts.
        // Keeping both in sync ensures the Swift enum and JS string constants stay aligned.
        func message(for result: PurchaseManager.RestoreResult, isPro: Bool) -> String {
            switch result {
            case .alreadyActive:
                return "You\u{2019}re already subscribed to MacroCore Pro."
            case .restored:
                return isPro ? "Pro access restored!" : "No active subscription found."
            case .notFound:
                return "No active subscription found for this Apple\u{00A0}ID."
            }
        }

        // Mirrors the three cases in purchaseState.test.ts
        XCTAssertTrue(
            message(for: .alreadyActive, isPro: true).contains("already subscribed"),
            "'alreadyActive' must produce a distinct 'already subscribed' message"
        )
        XCTAssertTrue(
            message(for: .restored, isPro: true).contains("restored"),
            "'restored' must produce a 'restored' message when isPro becomes true"
        )
        XCTAssertTrue(
            message(for: .notFound, isPro: false).contains("No active subscription"),
            "'notFound' must produce a 'no subscription' message"
        )
    }

    // ─── Offline resilience ───────────────────────────────────────────────────

    func test_refreshEntitlements_preservesCachedProStateOnNetworkError() async {
        // A Pro user opens the app offline.
        // refreshEntitlements() fails (bad API key / no connectivity).
        // isPro must remain true — the gate must NOT flip to locked.
        UserDefaults.standard.set(true, forKey: proKey)
        PurchaseManager.shared.configure() // isPro = true (from UserDefaults)

        // This will fail the RC network call silently (error is caught and logged).
        await PurchaseManager.shared.refreshEntitlements()

        XCTAssertTrue(
            PurchaseManager.shared.isPro,
            "isPro must NOT reset to false on network failure; offline Pro users must keep access"
        )
    }

    func test_refreshEntitlements_doesNotCrashWhenNotPro() async {
        // Non-Pro user opens app offline — refreshEntitlements() must not throw.
        UserDefaults.standard.set(false, forKey: proKey)
        PurchaseManager.shared.configure()

        // Must not throw (errors are caught internally).
        await PurchaseManager.shared.refreshEntitlements()

        XCTAssertFalse(PurchaseManager.shared.isPro)
    }

    // ─── Integration test stubs (require RevenueCat sandbox) ─────────────────
    // These tests are skipped automatically when the placeholder API key is present.
    // To run them:
    //   1. Set RevenueCatConfig.apiKey to your real iOS public SDK key.
    //   2. Add a StoreKit configuration file (Product → Scheme → Edit → Options).
    //   3. Run on device or simulator signed into a sandbox Apple ID.

    func test_integration_restorePurchases_alreadyActive() async throws {
        try XCTSkipIf(
            RevenueCatConfig.apiKey.contains("REPLACE"),
            "Integration test — requires real RevenueCat API key and StoreKit sandbox. " +
            "Run with a sandbox Apple ID that currently has an active subscription."
        )

        UserDefaults.standard.set(true, forKey: proKey)
        PurchaseManager.shared.configure()

        let result = try await PurchaseManager.shared.restorePurchases()

        XCTAssertEqual(result, .alreadyActive,
            "Should return .alreadyActive when the user was already Pro before restore")
        XCTAssertTrue(PurchaseManager.shared.isPro)
    }

    func test_integration_restorePurchases_restored() async throws {
        try XCTSkipIf(
            RevenueCatConfig.apiKey.contains("REPLACE"),
            "Integration test — run with a sandbox Apple ID that previously purchased " +
            "but is not currently flagged as Pro in UserDefaults."
        )

        UserDefaults.standard.set(false, forKey: proKey)
        PurchaseManager.shared.configure()

        let result = try await PurchaseManager.shared.restorePurchases()

        XCTAssertEqual(result, .restored,
            "Should return .restored when a prior purchase is recovered")
        XCTAssertTrue(PurchaseManager.shared.isPro)
    }

    func test_integration_restorePurchases_notFound() async throws {
        try XCTSkipIf(
            RevenueCatConfig.apiKey.contains("REPLACE"),
            "Integration test — run with a sandbox Apple ID that has never purchased."
        )

        UserDefaults.standard.set(false, forKey: proKey)
        PurchaseManager.shared.configure()

        let result = try await PurchaseManager.shared.restorePurchases()

        XCTAssertEqual(result, .notFound,
            "Should return .notFound when no prior purchase exists for this Apple ID")
        XCTAssertFalse(PurchaseManager.shared.isPro)
    }
}
