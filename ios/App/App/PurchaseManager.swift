import Foundation
import RevenueCat

// MARK: - PurchaseManager
// Singleton that owns the RevenueCat lifecycle.
// Capacitor's PaywallPlugin delegates purchase work here so there is one
// canonical isPro truth and one place to update the localStorage cache via JS.
@MainActor
final class PurchaseManager: NSObject {

    static let shared = PurchaseManager()
    private override init() {}

    // Reflects the active state of the "pro" entitlement.
    // Read directly from this property; do not store copies.
    private(set) var isPro: Bool = false

    // MARK: – Configuration

    /// Called once from AppDelegate.
    /// Replace the API key placeholder before shipping.
    func configure() {
        Purchases.logLevel = .warn
        Purchases.configure(withAPIKey: RevenueCatConfig.apiKey)
        // Restore cached value so the gate works before the first network call.
        isPro = UserDefaults.standard.bool(forKey: "mc_is_pro")
    }

    // MARK: – Entitlement refresh

    /// Hits the RevenueCat network and syncs isPro.
    /// Safe to call frequently — RevenueCat SDK caches internally.
    func refreshEntitlements() async {
        do {
            let info = try await Purchases.shared.customerInfo()
            updateProStatus(from: info)
        } catch {
            // Network unavailable: keep the last cached value.
            print("[PurchaseManager] refreshEntitlements error (non-fatal): \(error.localizedDescription)")
        }
    }

    // MARK: – Restore

    enum RestoreResult {
        case alreadyActive          // was Pro before restore — nothing changed
        case restored               // successfully recovered a lapsed entitlement
        case notFound               // no prior purchase found
    }

    /// Triggers StoreKit restore and returns a typed result so the UI can
    /// show distinct messaging ("already subscribed" vs "restored" vs "not found").
    @discardableResult
    func restorePurchases() async throws -> RestoreResult {
        let wasProBefore = isPro
        let info = try await Purchases.shared.restorePurchases()
        updateProStatus(from: info)
        if wasProBefore && isPro  { return .alreadyActive }
        if isPro                  { return .restored }
        return .notFound
    }

    // MARK: – Internal helpers

    func updateProStatus(from info: CustomerInfo) {
        let active = info.entitlements[RevenueCatConfig.proEntitlementId]?.isActive == true
        isPro = active
        // Persist so the JS layer can read mc_is_pro from localStorage via the cache layer.
        UserDefaults.standard.set(active, forKey: "mc_is_pro")
        // Notify the JS layer so the gate updates without a full page refresh.
        notifyJS(isPro: active)
    }

    private func notifyJS(isPro: Bool) {
        // Capacitor's bridge evaluates arbitrary JS.
        // PaywallPlugin.notifyListeners handles this; we use NotificationCenter
        // so PaywallPlugin can relay it without needing a direct reference.
        NotificationCenter.default.post(
            name: .mcEntitlementChanged,
            object: nil,
            userInfo: ["isPro": isPro]
        )
    }
}

// MARK: - Constants
enum RevenueCatConfig {
    /// Paste your RevenueCat iOS public SDK key from
    /// https://app.revenuecat.com → Project → API Keys → Public app-specific key
    static let apiKey = "appl_REPLACE_WITH_YOUR_RC_PUBLIC_KEY"
    static let proEntitlementId = "pro"
    static let offeringIdentifier = "default" // or your custom Offering ID
}

// MARK: - Notification names
extension Notification.Name {
    static let mcEntitlementChanged = Notification.Name("mc_entitlement_changed")
}
