import Foundation
import Capacitor
import RevenueCat
import RevenueCatUI // add RevenueCatUI SPM package alongside RevenueCat

// MARK: - PaywallPlugin
// Local Capacitor plugin (no npm package needed).
// Capacitor 6+ auto-discovers CAPBridgedPlugin conformers in the App target.
//
// JS usage:
//   const { Paywall } = Capacitor.Plugins;
//   const { isPro } = await Paywall.getEntitlementStatus();
//   const { isPro, purchased } = await Paywall.presentPaywall();
//   const { isPro } = await Paywall.restorePurchases();
//   Paywall.addListener('entitlementChanged', ({ isPro }) => { ... });
@objc(PaywallPlugin)
public class PaywallPlugin: CAPPlugin, CAPBridgedPlugin {

    // Required by CAPBridgedPlugin
    public let identifier = "PaywallPlugin"
    public let jsName = "Paywall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getEntitlementStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getOfferings",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentPaywall",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases",     returnType: CAPPluginReturnPromise),
    ]

    // Hold the in-flight call while the native paywall sheet is visible.
    private var pendingPaywallCall: CAPPluginCall?

    // Relay entitlement changes from PurchaseManager → JS listeners.
    private var entitlementObserver: NSObjectProtocol?

    public override func load() {
        entitlementObserver = NotificationCenter.default.addObserver(
            forName: .mcEntitlementChanged,
            object: nil,
            queue: .main
        ) { [weak self] note in
            if let isPro = note.userInfo?["isPro"] as? Bool {
                self?.notifyListeners("entitlementChanged", data: ["isPro": isPro])
            }
        }
    }

    deinit {
        if let obs = entitlementObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    // MARK: – Exposed to JS

    /// Returns the cached (then freshly-fetched) entitlement status.
    /// Resolves quickly from cache; network call is fire-and-forget.
    @objc func getEntitlementStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            // Return cached immediately so the gate doesn't flicker.
            let cached = PurchaseManager.shared.isPro
            call.resolve(["isPro": cached])
            // Then refresh silently; any change fires 'entitlementChanged' event.
            await PurchaseManager.shared.refreshEntitlements()
        }
    }

    /// Returns the packages in the default RevenueCat offering.
    /// Used by the web fallback paywall to populate pricing UI.
    @objc func getOfferings(_ call: CAPPluginCall) {
        Task {
            do {
                let offerings = try await Purchases.shared.offerings()
                let offeringId = RevenueCatConfig.offeringIdentifier
                let current = offerings[offeringId] ?? offerings.current
                let packages: [[String: Any]] = (current?.availablePackages ?? []).map { pkg in
                    [
                        "identifier": pkg.identifier,
                        "productIdentifier": pkg.storeProduct.productIdentifier,
                        "localizedPriceString": pkg.storeProduct.localizedPriceString,
                        "title": pkg.storeProduct.localizedTitle,
                        "description": pkg.storeProduct.localizedDescription,
                        "subscriptionPeriod": pkg.storeProduct.subscriptionPeriod?.debugDescription ?? "month",
                    ]
                }
                call.resolve(["packages": packages])
            } catch {
                call.reject("OFFERINGS_UNAVAILABLE", error.localizedDescription, error as NSError)
            }
        }
    }

    /// Purchases a specific package by identifier (used by web fallback paywall).
    @objc func purchase(_ call: CAPPluginCall) {
        guard let packageId = call.getString("packageIdentifier") else {
            call.reject("MISSING_PARAM", "packageIdentifier is required", nil)
            return
        }
        Task { @MainActor in
            do {
                let offerings = try await Purchases.shared.offerings()
                let current = offerings.current
                guard let pkg = current?.availablePackages.first(where: { $0.identifier == packageId }) else {
                    call.reject("PACKAGE_NOT_FOUND", "Package '\(packageId)' not in current offering", nil)
                    return
                }
                let result = try await Purchases.shared.purchase(package: pkg)
                PurchaseManager.shared.updateProStatus(from: result.customerInfo)
                call.resolve(["isPro": PurchaseManager.shared.isPro, "purchased": !result.userCancelled])
            } catch {
                call.reject("PURCHASE_FAILED", error.localizedDescription, error as NSError)
            }
        }
    }

    /// Presents the native RevenueCatUI paywall sheet.
    /// Resolves with { isPro, purchased } when the sheet is dismissed.
    @objc func presentPaywall(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let rootVC = self.bridge?.viewController else {
                call.reject("BRIDGE_UNAVAILABLE", "No root view controller", nil)
                return
            }
            // Dismiss any existing sheet first.
            if rootVC.presentedViewController != nil {
                rootVC.dismiss(animated: true)
            }
            pendingPaywallCall = call
            let paywallVC = PaywallViewController(displayCloseButton: true)
            paywallVC.delegate = self
            // .formSheet on iPad, full-sheet on iPhone.
            paywallVC.modalPresentationStyle = UIDevice.current.userInterfaceIdiom == .pad
                ? .formSheet
                : .pageSheet
            if #available(iOS 16.0, *) {
                if let sheet = paywallVC.sheetPresentationController {
                    sheet.detents = [.large()]
                    sheet.prefersGrabberVisible = true
                }
            }
            rootVC.present(paywallVC, animated: true)
        }
    }

    /// Triggers StoreKit restore and returns the updated entitlement + restore outcome.
    /// `restoreResult`: "alreadyActive" | "restored" | "notFound"
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let result = try await PurchaseManager.shared.restorePurchases()
                let resultString: String
                switch result {
                case .alreadyActive: resultString = "alreadyActive"
                case .restored:      resultString = "restored"
                case .notFound:      resultString = "notFound"
                }
                call.resolve([
                    "isPro": PurchaseManager.shared.isPro,
                    "restoreResult": resultString,
                ])
            } catch {
                call.reject("RESTORE_FAILED", error.localizedDescription, error as NSError)
            }
        }
    }
}

// MARK: - PaywallViewControllerDelegate
extension PaywallPlugin: PaywallViewControllerDelegate {

    /// Called when a purchase completes through the paywall sheet.
    public func paywallViewControllerDidFinishPurchasing(
        _ controller: PaywallViewController,
        customerInfo: CustomerInfo
    ) {
        PurchaseManager.shared.updateProStatus(from: customerInfo)
        let isPro = PurchaseManager.shared.isPro
        pendingPaywallCall?.resolve(["isPro": isPro, "purchased": true])
        pendingPaywallCall = nil
    }

    /// Called when restore completes through the paywall sheet's built-in button.
    public func paywallViewControllerDidFinishRestoringPurchases(
        _ controller: PaywallViewController,
        customerInfo: CustomerInfo
    ) {
        PurchaseManager.shared.updateProStatus(from: customerInfo)
    }

    /// Called when the user dismisses the paywall without purchasing.
    public func paywallViewControllerWasDismissed(_ controller: PaywallViewController) {
        pendingPaywallCall?.resolve([
            "isPro": PurchaseManager.shared.isPro,
            "purchased": false,
        ])
        pendingPaywallCall = nil
    }

    /// Called when a purchase fails (network error, user cancel via StoreKit, etc.)
    public func paywallViewController(
        _ controller: PaywallViewController,
        didFailPurchasingWith error: PublicError
    ) {
        // Don't reject — the user can retry; sheet stays open.
        print("[PaywallPlugin] Purchase error (non-fatal): \(error.localizedDescription)")
    }
}
