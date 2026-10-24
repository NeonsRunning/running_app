/**
 * Policy copy. Written as plain data so every policy page shares one layout,
 * one table of contents and one "last updated" convention.
 *
 * These are realistic drafts for a product demo, not legal advice — have
 * counsel review before this platform takes real money.
 */

import type { Locale } from "./i18n/config";
import { LEGAL_COPY_ES } from "./content/legal.es";

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms & Conditions",
    summary:
      "Welcome to NEONS RUNNING. By visiting our site, registering for our events, taking part in our races or buying any of our products or services, you accept these Terms and Conditions. Please read them carefully before registering or making a purchase.",
    updated: "22 October 2026",
    sections: [
      {
        heading: "1. About NEONS RUNNING",
        paragraphs: [
          "NEONS RUNNING is a platform dedicated to promoting running, physical activity, sports challenges and participation in in-person and virtual events. Activities may include 5K and 10K races, virtual challenges, medal deliveries, participation certificates and other sporting initiatives.",
          "The specific conditions of each event will be announced in its promotion or registration form.",
        ],
      },
      {
        heading: "2. Registration",
        paragraphs: [
          "Each participant must provide correct, complete and up-to-date information when registering.",
          "A registration is considered complete once the requirements stated for the event have been met, including payment where applicable.",
          "Each participant is responsible for checking the details of their registration, the dates, costs, instructions and participation requirements.",
          "NEONS RUNNING reserves the right to reject or cancel registrations for false information, breach of the rules or other justified circumstances, in accordance with applicable law.",
          "Registration is personal and may not be transferred to another person without prior authorization from the organization.",
        ],
      },
      {
        heading: "3. Costs and payments",
        paragraphs: [
          "The costs of registration, products, medals, certificates and other services will be stated in the corresponding promotion.",
          "Participants must complete payment according to the published instructions.",
          "Any applicable additional charge must be disclosed before the transaction is completed.",
          "Keep your proof of payment as evidence of the transaction.",
          "Payments are not automatically refundable simply because a participant decides not to take part. Eligibility for a refund is subject to the policy announced for the event and to applicable law.",
          "If NEONS RUNNING cancels an event, the cancellation and refund policy communicated for that event will apply, respecting the rights the consumer is entitled to.",
        ],
      },
      {
        heading: "4. Virtual races and challenges",
        paragraphs: [
          "In virtual races, each participant may complete the set distance within the period announced for the event, following the official instructions.",
          "The participant is responsible for: choosing an appropriate and safe route; obeying traffic laws and the rules of the place where the activity takes place; wearing suitable clothing, footwear and equipment; staying hydrated and assessing the weather conditions; completing the distance and submitting proof of participation when the event requires it; and submitting results within the stated deadline.",
          "NEONS RUNNING may set specific requirements to validate results, including screenshots from sports apps, distance logs, photographs or other reasonable evidence.",
          "Submitting false or altered information may result in the participant's disqualification.",
        ],
      },
      {
        heading: "5. Health, safety and disclaimer",
        paragraphs: [
          "Taking part in sporting activities carries inherent risks, including injuries, falls, exhaustion, dehydration and accidents.",
          "Each participant acknowledges that they are responsible for assessing their physical condition, taking the necessary precautions and seeking medical advice where appropriate.",
          "In virtual events, the participant assumes responsibility for choosing a safe route and doing the activity under appropriate conditions.",
          "To the extent permitted by law, NEONS RUNNING is not liable for risks inherent to participation that are not attributable to conduct for which legal liability applies. Nothing in these terms excludes liabilities or rights that cannot legally be excluded.",
          "Accepting these terms does not replace any specific waiver that may be required for an event.",
        ],
      },
      {
        heading: "6. Medals, certificates and merchandise",
        paragraphs: [
          "When an event includes medals, certificates or other items, the promotion will state what is included and the delivery conditions.",
          "Items will be delivered according to the announced schedule, method and location.",
          "Delivery dates may be adjusted for logistical reasons or circumstances beyond the organization's reasonable control. Any significant change will be communicated to participants.",
          "Participants must provide correct information for delivery or shipping.",
          "Shipping costs, if any, will be communicated before the purchase is completed.",
          "Manufacturing defects, damaged items or incorrect deliveries must be reported to the organization so a reasonable solution can be found under the applicable policy and current law.",
        ],
      },
      {
        heading: "7. Changes, postponements and cancellations",
        paragraphs: [
          "NEONS RUNNING may change times, routes, venues, dates or procedures when necessary for reasons of safety, weather, logistics, availability of materials or other justified circumstances.",
          "When a significant change occurs, we will make every effort to notify participants through the official channels available.",
          "If an event is postponed or cancelled, the applicable alternatives — including rescheduling, credit or a refund where appropriate — will be communicated in line with the event's specific policy and applicable law.",
        ],
      },
      {
        heading: "8. Participant conduct",
        paragraphs: [
          "All participants must behave respectfully towards organizers, volunteers, other runners and members of the community.",
          "The following are not permitted: harassment, threats, discrimination or abusive behaviour; knowingly submitting false results; misuse of the brand or impersonating NEONS RUNNING representatives; and failing to follow safety instructions or the official event rules.",
          "Breaches may lead to disqualification or restricted participation, depending on the seriousness of the situation and applicable law.",
        ],
      },
      {
        heading: "9. Intellectual property and use of the brand",
        paragraphs: [
          "The NEONS RUNNING name, its logos, original designs, promotions, official photographs, graphics and published materials belong to their respective owners or are used with permission.",
          "These materials may not be copied, modified, distributed, sold or used in any way that infringes intellectual property rights or suggests an unauthorized affiliation.",
          "Participants may share NEONS RUNNING posts on social media in a legitimate way, respecting the integrity of the content and the corresponding rights.",
        ],
      },
      {
        heading: "10. Photos, videos and publications",
        paragraphs: [
          "Photographs or videos may be taken during some events for informational, sporting or promotional purposes.",
          "Any promotional use of identifiable images of participants is subject to the necessary authorizations and applicable law, especially where minors are involved.",
          "Where appropriate, NEONS RUNNING will ask for consent separately. Taking part in an event should not, on its own, be read as unlimited permission to use a person's image.",
        ],
      },
      {
        heading: "11. Privacy and data protection",
        paragraphs: [
          "NEONS RUNNING may collect the data needed to manage registrations, confirm payments, validate results, coordinate deliveries and communicate with participants.",
          "Personal information will be used for the purposes stated when it is collected and handled in accordance with applicable law.",
          "Other participants' personal information must not be published without authorization. Participants may ask about how their data is processed through the official contact channels.",
          "Payment data must be processed through appropriate methods and must not be shared publicly.",
        ],
      },
      {
        heading: "12. Minors",
        paragraphs: [
          "Participants under 18 must have the authorization of their parent or legal guardian where required.",
          "The organization may set additional supervision, safety and documentation requirements for minors to take part.",
          "Authorizations must be obtained before participation and do not remove the minor's legal rights or the obligations that fall on the organization.",
        ],
      },
      {
        heading: "13. Official communications",
        paragraphs: [
          "Updates, instructions, announcements and changes to events will be published through NEONS RUNNING's official channels.",
          "Each participant is responsible for reviewing the information related to their registration and keeping their contact details up to date.",
          "NEONS RUNNING is not responsible for messages sent by unofficial accounts posing as representatives of the organization.",
        ],
      },
      {
        heading: "14. Changes to these terms",
        paragraphs: [
          "NEONS RUNNING may update these Terms and Conditions when necessary.",
          "Changes will be published on the site with the corresponding update date. Material changes affecting a registration already made will be handled in accordance with applicable law and the relevant contractual conditions.",
        ],
      },
      {
        heading: "15. Governing law",
        paragraphs: [
          "These Terms and Conditions are governed by the applicable laws of Puerto Rico and, where relevant, the federal laws of the United States.",
          "Nothing in this document is intended to limit participants' or consumers' non-waivable legal rights.",
        ],
      },
      {
        heading: "16. Acceptance of the terms",
        paragraphs: [
          "By using NEONS RUNNING's services, completing a registration or buying a product, the participant acknowledges that they have had the opportunity to read these Terms and Conditions.",
          "Where express acceptance is required, it will be requested through the corresponding mechanism before the registration or transaction is completed.",
          "Official contact: neonsmultiservicesllc@gmail.com · Official site: neonsrunning.com",
          "NEONS RUNNING — Run with passion. Push your limits. Leave your mark.",
        ],
      },
    ],
  },
  {
    slug: "waiver",
    title: "Waiver and Assumption of Risk",
    summary:
      "By registering for, taking part in or entering any event, in-person or virtual race, sports challenge or activity organized, promoted or sponsored by NEONS RUNNING, I acknowledge and accept the following.",
    updated: "23 October 2026",
    sections: [
      {
        heading: "1. Voluntary participation and risks",
        paragraphs: [
          "I understand that taking part in running, walking and sporting events carries inherent risks, including, among others, falls, injuries, accidents, dehydration, exhaustion, adverse weather conditions and other situations that could affect my health or safety.",
        ],
      },
      {
        heading: "2. Physical condition and health",
        paragraphs: [
          "I declare that I am responsible for assessing my physical condition and for consulting a health professional when necessary before taking part. I certify that I will take part within my abilities and that I will stop the activity if I experience symptoms or conditions that may put my wellbeing at risk.",
        ],
      },
      {
        heading: "3. Personal responsibility",
        paragraphs: [
          "I accept that I am responsible for my conduct, my belongings, my physical preparation and for following the safety instructions that apply during the activity.",
        ],
      },
      {
        heading: "4. Release of liability",
        paragraphs: [
          "To the extent permitted by applicable law, I release NEONS RUNNING, its organizers, representatives, collaborators, volunteers and sponsors from claims for injury, loss or damage related to my participation, except where liability cannot legally be excluded, including cases arising from negligence or other causes under the law.",
        ],
      },
      {
        heading: "5. Virtual events",
        paragraphs: [
          "If I take part in a virtual race or challenge, I acknowledge that I am responsible for choosing a safe route, checking the conditions of the location, obeying traffic laws and taking the necessary precautions during the activity.",
        ],
      },
      {
        heading: "6. Minors",
        paragraphs: [
          "Participation by minors requires the authorization of their parent or legal guardian, who must accept the corresponding conditions and assume the responsibilities that legally fall to them.",
        ],
      },
      {
        heading: "7. Emergencies",
        paragraphs: [
          "I authorize a request for emergency medical assistance when reasonably necessary during an activity, acknowledging that any medical service will be subject to its own terms and applicable costs.",
        ],
      },
      {
        heading: "8. Acceptance",
        paragraphs: [
          "I declare that I have read and understood this document, that I take part voluntarily and that I accept its terms. I understand that this waiver does not remove the rights I hold under applicable law.",
          "NEONS RUNNING — Run with passion, push your limits and enjoy every kilometer responsibly.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy and Data Protection Policy",
    summary:
      "At NEONS RUNNING we respect the privacy of our participants, customers and visitors, and we are committed to handling personal information responsibly, transparently and securely. This policy explains what information we may collect, how we use it, when we may share it and what choices people have about their data when they visit our site, register for events, take part in virtual races or buy our products and services.",
    updated: "22 October 2026",
    sections: [
      {
        heading: "1. Information we collect",
        paragraphs: [
          "Depending on the activity or service requested, NEONS RUNNING may collect the following data:",
          "Personal information: first and last name.",
          "Contact information: email address, phone number and, when needed to make a delivery, mailing address.",
          "Registration information: the event selected, distance, participant number and registration status.",
          "Sports information: distance completed, recorded time, results and, when required to validate a challenge, proof of participation.",
          "Payment information: transaction confirmation and the data needed to verify the payment. Full card or other payment-instrument details must be processed through appropriate payment providers and will never be requested publicly.",
          "Communications: messages, enquiries and requests related to our activities.",
          "Technical information: certain browsing or usage data, if the platform we use collects it through its own tools or similar technologies.",
          "We will only collect the information reasonably necessary for the purposes we have stated.",
        ],
      },
      {
        heading: "2. How we use the information",
        paragraphs: [
          "Personal information may be used to: process and manage registrations; confirm payments and purchases; coordinate participation in races and virtual challenges; verify results and proof of activity; organize the preparation and delivery of medals, certificates and other items; send confirmations, instructions, updates and event notices; respond to questions, complaints and service requests; prevent fraudulent transactions and misuse of our services; comply with applicable legal obligations; and send promotions or marketing communications where appropriate and in line with the necessary preferences and authorizations.",
          "NEONS RUNNING will not use data for purposes incompatible with those stated without the corresponding authorization or another valid legal basis.",
        ],
      },
      {
        heading: "3. Sharing information with third parties",
        paragraphs: [
          "NEONS RUNNING does not sell its participants' personal information.",
          "We may share strictly necessary data with third parties when it is essential to provide our services, for example: platforms used to manage registrations; payment processors; courier and postal services; web hosting, form and technology providers; and professionals or authorities where there is a valid legal obligation.",
          "These third parties may process information in accordance with their own policies, contracts and legal obligations.",
          "Only the information relevant to the purpose in question will be shared, and we will seek to keep reasonable protective measures in place.",
        ],
      },
      {
        heading: "4. Photos, videos and social media",
        paragraphs: [
          "Photos and videos may be taken during our events to document the sporting activities.",
          "Identifiable images of participants will be published for promotional purposes only where the necessary authorization or legal basis exists. Where appropriate, we will ask for specific consent.",
          "Taking part in a race does not, on its own, amount to unlimited permission to publish or commercialize a person's image.",
          "Participants must not publish other runners' personal information without proper authorization.",
          "Photos, videos and posts shared directly by users on social media may also be subject to those platforms' policies.",
        ],
      },
      {
        heading: "5. Privacy in virtual races",
        paragraphs: [
          "To validate participation in a virtual challenge, NEONS RUNNING may ask for proof such as screenshots from sports apps, distance logs, times or photos related to the activity.",
          "We recommend hiding any information not needed to verify the result, such as home addresses, login details, financial information or other sensitive data.",
          "We do not ask for passwords to personal sports-app accounts to validate a race.",
          "Results published publicly will be limited to the information relevant to the event and to the uses communicated to participants.",
        ],
      },
      {
        heading: "6. Data security and retention",
        paragraphs: [
          "NEONS RUNNING will adopt reasonable administrative, technical and organizational measures to protect information against unauthorized access, disclosure, loss, alteration or misuse.",
          "Access to data must be limited to the people who need it to carry out authorized tasks.",
          "We will keep information for as long as necessary to manage registrations, handle complaints, comply with legal obligations and maintain legitimately required records. After that, data may be deleted or anonymized where appropriate.",
          "No system for transmitting or storing information can guarantee absolute security.",
        ],
      },
      {
        heading: "7. Cookies and similar technologies",
        paragraphs: [
          "If our website or the tools we use include cookies or similar technologies, these may be used for technical functions, preferences, usage analytics or advertising, as appropriate.",
          "The options for managing or disabling these technologies depend on the platform and browser used.",
          "Where the law requires it, we will ask for the corresponding consent before using non-essential technologies.",
        ],
      },
      {
        heading: "8. Participants' rights and requests",
        paragraphs: [
          "Depending on applicable law and the circumstances of each request, people may ask for: access to certain personal data we hold; correction of inaccurate information; deletion of data where legally appropriate; withdrawal of consent for uses based on that consent; opting out of promotional communications; and information about how their information is used or shared.",
          "To protect privacy, we may ask for reasonable information to verify the identity of the person making a request.",
          "Some records may be retained where there is a legal obligation or another legitimate reason that allows it.",
        ],
      },
      {
        heading: "9. Privacy of minors",
        paragraphs: [
          "NEONS RUNNING recognizes the importance of protecting minors' information.",
          "When a registration requires authorization from a parent or legal guardian, the information needed to manage that authorization and the minor's participation will be requested.",
          "We do not intend to knowingly collect minors' personal information in any way incompatible with applicable law. Photos, videos and other identifiable data of minors will receive special consideration and will be handled with the appropriate authorizations.",
        ],
      },
      {
        heading: "10. Links and external platforms",
        paragraphs: [
          "Our site may include links to Facebook, Instagram, registration platforms, payment services or other external sites.",
          "NEONS RUNNING does not necessarily control the privacy practices of these platforms. We recommend reviewing their respective policies before providing personal information.",
          "Information shared directly with an external platform will also be subject to that platform's terms and practices.",
        ],
      },
      {
        heading: "11. Changes to this policy",
        paragraphs: [
          "NEONS RUNNING may update this Privacy Policy to reflect changes in our services, data-handling practices or legal requirements.",
          "The current version will be published on our official channels and will include the date it was last updated.",
          "Where a change requires notice or additional consent, the corresponding steps will be taken in accordance with applicable law.",
        ],
      },
      {
        heading: "12. Governing law",
        paragraphs: [
          "This policy will be interpreted in accordance with the applicable laws of Puerto Rico and, where relevant, the federal laws of the United States on privacy and data protection.",
          "Nothing in this policy is intended to limit the rights people hold under applicable law.",
        ],
      },
      {
        heading: "13. Privacy contact and requests",
        paragraphs: [
          "To ask a question about this policy, request access to your data or ask for information to be corrected or deleted, you can contact NEONS RUNNING through the following channels:",
          "Official email: neonsmultiservicesllc@gmail.com · Official site: neonsrunning.com · Suggested subject: Personal data privacy request.",
          "We will respond to requests within a reasonable time, subject to the necessary verification and to applicable legal requirements.",
          "NEONS RUNNING — Run with passion. Push your limits. Leave your mark. Your trust matters to us. We are committed to treating your information responsibly and transparently.",
        ],
      },
    ],
  },
  {
    slug: "refunds",
    title: "Refund, Cancellation and Delivery Policy",
    summary:
      "At NEONS RUNNING we work to deliver memorable sporting experiences, promote running and recognize every participant's effort. For clarity and transparency, this policy covers our in-person races, virtual races, sports challenges, medals, certificates and other products or services.",
    updated: "22 October 2026",
    sections: [
      {
        heading: "1. Registrations and payments",
        paragraphs: [
          "Once registration is complete and payment is confirmed, NEONS RUNNING begins coordinating the services, materials and items for the event.",
          "For this reason, before paying, each participant must check the event information, the registration cost, the distance, the dates and the items included.",
        ],
      },
      {
        heading: "2. No-refund policy",
        paragraphs: [
          "As a general rule, registrations are not refundable when the participant: decides not to take part for personal reasons; does not complete the distance or sports challenge; does not submit their results or evidence within the stated period; registers by mistake or changes their mind after completing the purchase; or does not claim their medal or certificate within the announced delivery period.",
          "This provision is subject to the exceptions set out in this policy and to the consumer rights that apply under applicable law.",
        ],
      },
      {
        heading: "3. Cancellation by NEONS RUNNING",
        paragraphs: [
          "If NEONS RUNNING cancels an event and does not offer a reasonable alternative, the corresponding refund will be assessed according to the conditions announced for that event and applicable law.",
          "If the event is postponed or its date changes, participants will be informed of the available alternatives.",
          "Where a refund is legally due, it will be processed to the original payment method, unless another permitted method is agreed.",
        ],
      },
      {
        heading: "4. Medals, certificates and personalized items",
        paragraphs: [
          "Medals, certificates and other items included in a registration may require preparation, manufacture or personalization.",
          "Once that process has begun, cancellation by the participant does not guarantee a refund. This condition does not, however, remove any rights that may apply in cases of defects, failure to deliver or other situations protected by law.",
          "If an item arrives damaged, is defective or does not match what was advertised, the participant should contact NEONS RUNNING so an appropriate solution can be assessed.",
        ],
      },
      {
        heading: "5. Delivery and shipping",
        paragraphs: [
          "Participants are responsible for correctly providing their name, mailing address and any other details needed for delivery.",
          "If a package cannot be delivered because of incorrect information provided by the participant, a possible redelivery will be coordinated and any additional costs will be communicated before it is processed.",
          "If a shipment is delayed or lost for reasons attributable to the carrier or the organization, the case will be assessed and a solution offered in accordance with the applicable conditions and the law.",
        ],
      },
      {
        heading: "6. Refund requests",
        paragraphs: [
          "Every request must be sent through NEONS RUNNING's official channels and include: the participant's full name; the name of the event or product purchased; the registration or purchase date; the confirmation number or proof of payment; an explanation of the request; and photographs or other evidence, where relevant.",
          "NEONS RUNNING will review the request and respond within a reasonable time.",
          "When a refund is approved, the time for the funds to appear in the account depends on the payment method and the financial institution involved.",
        ],
      },
      {
        heading: "7. Duplicate payments and billing errors",
        paragraphs: [
          "If a participant notices a duplicate payment or a billing error, they should report it so it can be investigated.",
          "When a duplicate or improper charge is confirmed, the corresponding correction or refund will be handled in accordance with applicable law.",
        ],
      },
      {
        heading: "8. Exceptions and consumer rights",
        paragraphs: [
          "This policy is not intended to remove or restrict rights that consumers hold under the applicable laws of Puerto Rico or the federal laws of the United States.",
          "Any specific condition announced for an event must be read together with this policy. Where there is a conflict, the rights and obligations required by applicable law prevail.",
        ],
      },
      {
        heading: "9. Acceptance",
        paragraphs: [
          "By completing a registration or purchase, the participant acknowledges that they have had the opportunity to review this policy before paying.",
          "NEONS RUNNING is committed to assessing requests fairly, transparently and consistently.",
          "Contact for requests: neonsmultiservicesllc@gmail.com · Official site: neonsrunning.com",
          "NEONS RUNNING — Run with passion. Push your limits. Leave your mark.",
        ],
      },
    ],
  },
  {
    slug: "cancellation",
    title: "Event Cancellation, Suspension and Rescheduling Policy",
    summary:
      "At NEONS RUNNING, our commitment is to promote running, physical activity and sporting experiences that motivate every participant to push their limits. To keep communication clear and transparent, we set out the following policy for our in-person events, virtual races, sports challenges and special activities.",
    updated: "22 October 2026",
    sections: [
      {
        heading: "1. Cancellation by NEONS RUNNING",
        paragraphs: [
          "NEONS RUNNING reserves the right to cancel an event when circumstances prevent it from being held safely, appropriately or in line with applicable requirements.",
          "Possible causes include dangerous weather conditions; emergencies or safety risks; logistical problems or difficulties with suppliers; lack of the necessary permits or authorizations; and unforeseen circumstances beyond the organization's reasonable control.",
          "When an event is cancelled, NEONS RUNNING will notify participants through the available official channels and inform them of the corresponding alternatives.",
        ],
      },
      {
        heading: "2. Rescheduling of events",
        paragraphs: [
          "When circumstances allow, NEONS RUNNING may reschedule the event for a new date.",
          "The organization will communicate the new date, any significant changes and the necessary instructions to registered participants.",
          "If a participant cannot take part on the new date, their request will be evaluated according to the specific conditions of the event, the refund policy and applicable law.",
        ],
      },
      {
        heading: "3. Suspension due to weather or emergencies",
        paragraphs: [
          "Participant safety is a priority.",
          "If weather conditions, an emergency or any risk situation prevents an activity from being carried out safely, NEONS RUNNING may suspend it, delay its start, modify the route or change the date.",
          "These decisions will be communicated as soon as reasonably possible.",
        ],
      },
      {
        heading: "4. Cancellation of virtual races",
        paragraphs: [
          "For virtual events, the start and end dates, distance, participation requirements and deadlines for submitting results will be set out in the official promotion.",
          "NEONS RUNNING may modify these periods or cancel the challenge when there are justified reasons, notifying participants of the changes.",
          "If a virtual event is cancelled after a registration has been made, the available options will be communicated, including rescheduling or a refund where applicable under the announced conditions and applicable law.",
        ],
      },
      {
        heading: "5. Refunds for cancellation",
        paragraphs: [
          "If NEONS RUNNING permanently cancels an event without offering a reasonable alternative, the treatment of payments received will be determined according to the specific conditions announced and applicable law.",
          "Where a refund is due, it will be processed through the original payment method, unless another permitted method is agreed.",
          "If the event is rescheduled, any refund or credit alternative will be clearly communicated to participants.",
          "This policy does not limit consumers' legal rights.",
        ],
      },
      {
        heading: "6. Medals, certificates and merchandise",
        paragraphs: [
          "If a registration includes medals, certificates or other items, NEONS RUNNING will explain how these products will be handled if the event is cancelled or rescheduled.",
          "Where items have already been manufactured, personalized or shipped, the organization will evaluate the applicable alternatives according to the circumstances, the purchase conditions and the corresponding legal obligations.",
          "Cancelling an activity does not remove consumer rights relating to undelivered or defective products or unfulfilled services.",
        ],
      },
      {
        heading: "7. Cancellation by the participant",
        paragraphs: [
          "If a participant decides to withdraw from an event for personal reasons, they must notify NEONS RUNNING through the official channels.",
          "The request does not automatically guarantee a refund, a registration transfer or the delivery of items not included in the original conditions.",
          "Requests will be evaluated according to the refund policy in force for the event and applicable law.",
        ],
      },
      {
        heading: "8. Official communication",
        paragraphs: [
          "Every notice relating to cancellations, suspensions or date changes will be published through NEONS RUNNING's official channels.",
          "Participants should review announcements and keep their contact details up to date.",
          "The organization will strive to provide clear and timely information about any significant change.",
        ],
      },
      {
        heading: "9. Acceptance of the policy",
        paragraphs: [
          "By registering for a NEONS RUNNING event, the participant acknowledges that sporting events may be subject to changes for reasons of safety, logistics or unforeseen circumstances.",
          "The application of this policy is subject to the laws of Puerto Rico and any other applicable legislation. No provision is intended to exclude liabilities or rights that cannot legally be excluded.",
          "NEONS RUNNING — Run with passion. Push your limits. Leave your mark.",
          "Official contact: neonsmultiservicesllc@gmail.com · Official site: neonsrunning.com",
        ],
      },
    ],
  },
  {
    slug: "organizer-terms",
    title: "Organizer Terms",
    summary:
      "What you agree to when you publish a race on NEONS RUNNING, and what we owe you.",
    updated: "1 June 2026",
    sections: [
      {
        heading: "Listing an event",
        paragraphs: [
          "Listing is free. You keep every entry fee; runners pay the flat service fee at checkout.",
          "Your listing must be accurate about distance, date, start time, course surface, cutoff and what an entry includes. Material changes must be published to registered runners through the platform, not only on social media.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "You are the organizer of your event. Permits, road closures, marshals, medical cover, insurance and the safety of the course are yours, not ours.",
          "You must hold public liability insurance appropriate to the field size, and be able to show it on request.",
        ],
      },
      {
        heading: "Runner data",
        paragraphs: [
          "You receive participant data to run the event and time it. You may not use it for marketing unrelated to that event, sell it, or retain it beyond 24 months after race day.",
        ],
      },
      {
        heading: "Payouts",
        paragraphs: [
          "Funds settle within five business days of race day, net of refunds, chargebacks and any donations owed to a named charity. Partial early payouts are available for events with over 300 entries — ask support.",
        ],
      },
      {
        heading: "Results",
        paragraphs: [
          "Post official results within 48 hours of the finish. Results published on NEONS RUNNING become part of each runner's permanent profile, so corrections must be made through the platform rather than by re-uploading a file.",
        ],
      },
      {
        heading: "Removal",
        paragraphs: [
          "We may remove a listing that is inaccurate, unsafe, or repeatedly cancelled, and we will refund every affected entry if we do.",
        ],
      },
    ],
  },
];

/**
 * Layer the requested locale's copy over the base document. Sections are
 * matched on their English heading, so a base section with no translation
 * falls through as written rather than dropping out of the page.
 */
function localizeDoc(doc: LegalDoc, locale: Locale): LegalDoc {
  const copy = locale === "es" ? LEGAL_COPY_ES[doc.slug] : undefined;
  if (!copy) return doc;

  return {
    ...doc,
    title: copy.title,
    summary: copy.summary,
    updated: copy.updated,
    sections: doc.sections.map((section) => copy.sections[section.heading] ?? section),
  };
}

/** Slugs are locale-independent, so route generation needs no locale. */
export function getLegalSlugs(): string[] {
  return LEGAL_DOCS.map((d) => d.slug);
}

export function getLegalDocs(locale: Locale): LegalDoc[] {
  return LEGAL_DOCS.map((doc) => localizeDoc(doc, locale));
}

export function getLegalDoc(slug: string, locale: Locale): LegalDoc | undefined {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  return doc && localizeDoc(doc, locale);
}
