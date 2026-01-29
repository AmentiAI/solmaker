export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-white/70 mb-6">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
            <p className="text-white/80 mb-4">
              ordmaker.fun ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, 
              use, disclose, and safeguard your information when you use our Platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">2. Information We Collect</h2>
            <div className="text-white/80 space-y-4">
              <p>
                <strong>2.1 Wallet Information:</strong> We collect and store wallet addresses when you connect to the Platform. 
                This information is necessary for transaction processing and Platform functionality.
              </p>
              <p>
                <strong>2.2 Transaction Data:</strong> We collect information about transactions you make on the Platform, including 
                purchase history, minting activity, and payment information.
              </p>
              <p>
                <strong>2.3 Usage Data:</strong> We automatically collect information about how you interact with the Platform, including 
                IP addresses, browser type, device information, and usage patterns.
              </p>
              <p>
                <strong>2.4 Content You Create:</strong> We collect and store content you create, generate, or upload to the Platform, 
                including ordinals, collections, and associated metadata.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Information</h2>
            <div className="text-white/80 space-y-4">
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide, maintain, and improve the Platform</li>
                <li>Process transactions and payments</li>
                <li>Authenticate users and prevent fraud</li>
                <li>Communicate with you about the Platform</li>
                <li>Comply with legal obligations</li>
                <li>Enforce our Terms and Conditions</li>
                <li>Analyze usage patterns to improve our services</li>
              </ul>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">4. Information Sharing and Disclosure</h2>
            <div className="text-white/80 space-y-4">
              <p>
                <strong>4.1 Public Information:</strong> Certain information, such as wallet addresses and public transaction data, 
                may be publicly visible on the blockchain and through the Platform.
              </p>
              <p>
                <strong>4.2 Service Providers:</strong> We may share information with third-party service providers who assist us in 
                operating the Platform, processing transactions, or providing services to you.
              </p>
              <p>
                <strong>4.3 Legal Requirements:</strong> We may disclose information if required by law, court order, or government 
                regulation, or to protect our rights, property, or safety.
              </p>
              <p>
                <strong>4.4 Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information 
                may be transferred to the acquiring entity.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">5. Data Security</h2>
            <p className="text-white/80">
              We implement reasonable security measures to protect your information. However, no method of transmission over the internet 
              or electronic storage is 100% secure. We cannot guarantee absolute security of your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">6. Blockchain and Public Data</h2>
            <div className="text-white/80 space-y-4">
              <p>
                <strong>6.1 Public Nature:</strong> Transactions on the Bitcoin blockchain are public and permanent. Information recorded 
                on the blockchain, including wallet addresses and transaction details, cannot be deleted or modified.
              </p>
              <p>
                <strong>6.2 No Anonymity:</strong> While wallet addresses may appear anonymous, they can potentially be linked to your 
                identity through various means, including transaction analysis and other publicly available information.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">7. Your Rights and Choices</h2>
            <div className="text-white/80 space-y-4">
              <p>
                <strong>7.1 Access and Correction:</strong> You may access and update certain information through your account settings 
                on the Platform.
              </p>
              <p>
                <strong>7.2 Deletion:</strong> You may request deletion of certain information, subject to our legal obligations and 
                the immutable nature of blockchain data.
              </p>
              <p>
                <strong>7.3 Opt-Out:</strong> You may opt out of certain communications from us, though we may still send essential 
                service-related communications.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">8. Cookies and Tracking Technologies</h2>
            <p className="text-white/80">
              We use cookies and similar tracking technologies to collect and store information about your use of the Platform. You can 
              control cookies through your browser settings, though disabling cookies may affect Platform functionality.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">9. Children's Privacy</h2>
            <p className="text-white/80">
              The Platform is not intended for users under the age of 18. We do not knowingly collect information from children. If you 
              believe we have collected information from a child, please contact us immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">10. International Users</h2>
            <p className="text-white/80">
              The Platform may be accessed from countries around the world. By using the Platform, you consent to the transfer of your 
              information to and processing in countries where we operate, which may have different data protection laws than your country.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">11. Changes to This Privacy Policy</h2>
            <p className="text-white/80">
              We may update this Privacy Policy from time to time. Changes will be effective immediately upon posting. We encourage you to 
              review this Privacy Policy periodically to stay informed about how we protect your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">12. Contact Us</h2>
            <p className="text-white/80">
              If you have questions about this Privacy Policy, please contact us through the Platform's support system.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

