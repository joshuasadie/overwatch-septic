// The Inspection and Maintenance Agreement, built from the state sample. Used by the Worker (to fix the exact text that is signed),
// the signing page, and the PDF. Returns { title, intro: [..], sections: [{ h, p: [..] }] }.
const T = v => String(v ?? '').trim();
export const DEFAULT_TERMS = {
  rules: '15A N.C. Administrative Code 18A.1900 et seq.',
  cite: '15A N.C. Administrative Code 18A.1961',
  response_hours: '48', annual_fee: '', increase_pct: '10', interest_pct: '1.5', repair_days: '30',
  maintenance: ['Check the pump and float switches', 'Check the alarm and control panel', 'Check the drain field'],
};
export function dateParts(iso) {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')), n = d.getDate();
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 < 4 ? n % 10 : 0];
  return { day: n + suffix, month: d.toLocaleString('en-US', { month: 'long' }), year: d.getFullYear() };
}
export function contractText(t) {
  const x = { ...DEFAULT_TERMS, ...t }, dp = dateParts(x.date || new Date().toISOString().slice(0, 10)), ty = T(x.sys_type), cite = T(x.cite);
  const maint = (x.maintenance || []).filter(Boolean).map((m, i) => `${i + 1}) ${T(m)}`);
  return {
    title: 'INSPECTION AND MAINTENANCE AGREEMENT',
    intro: [
      'STATE OF NORTH CAROLINA',
      `COUNTY OF ${T(x.county)}`,
      `This agreement is made and entered into this ${dp.day} day of ${dp.month}, ${dp.year}, by and between ${T(x.owner_name)} (hereinafter referred to as the "Owner") and ${T(x.contractor_name)} (hereinafter referred to as the "Contractor").`,
      'WITNESSETH',
      `WHEREAS, the Owner owns or controls the property upon which a ground absorption sewage treatment system (hereinafter "system") is installed, such system being designated a Type ${ty} system under the Rules for Sanitary Sewage Collection, Treatment and Disposal found at ${T(x.rules)}; and`,
      `WHEREAS, ${cite} requires a contract to be executed between the system owner and a management entity prior to the issuance of an Operation Permit for said system; and`,
      `WHEREAS, ${cite} requires that a condition of the Operation Permit for said system be that a properly executed contract between the system owner and a management entity, shall be in effect for as long as the system is in use; and`,
      `WHEREAS, the Contractor is a management entity, of a type authorized by ${cite} to manage a Type ${ty} system.`,
      'NOW THEREFORE, in consideration of the premises and of the mutual covenants and promises contained in this Agreement, it is hereby agreed by and between the Owner and the Contractor as stipulated below.',
    ],
    sections: [
      { h: "1. The Contractor's Obligations.", p: [
        `The Contractor shall perform the following services on the Owner's system located at ${T(x.system_address)}${x.permit ? ' (Permit ' + T(x.permit) + ')' : ''}:`,
        `a) The contractor shall inspect the system at least at the frequency required in Table V(b) of ${cite}(b) for a Type ${ty} System.`,
        'b) The Contractor shall perform the following routine maintenance procedures in accordance with the conditions of the Operation Permit:',
        ...maint,
        `c) The Contractor shall report the results of its inspections to the local health department at the frequency specified in Table V (b) of ${cite}(b) for a Type ${ty} System.`,
        'd) If an inspection indicates the need for system repairs, the Contractor shall notify the local health department within 48 hours of the inspection.',
        'e) The Contractor shall notify the Owner of needed repairs, which are outside of the scope of routine maintenance described in subparagraph (b) above. The Contractors shall perform necessary repairs to the system at the request of the Owner and shall be entitled to payment therefor at the Contractor\'s normal charge for services and materials.',
        `f) The Contractors shall employ or shall contract with a certified operator(s) if required by Table V (b) of ${cite}(b) for a Type ${ty} System.`,
        `g) The Contractor shall respond to a request for a nonscheduled service or maintenance call within ${T(x.response_hours)} hours after receipt of such request.`,
      ] },
      { h: "2. The Owner's Obligations.", p: [
        `a) The Owner shall pay to the Contractor the sum of $${T(x.annual_fee)} per year for periodic inspections, routine maintenance procedures and periodic reports. The annual fee may be amended upon sixty (60) days advance notice to the Owner but may not be increased more than ${T(x.increase_pct)} percent per year. The Owner shall pay to the Contractor his normal and customary fees for any work performed on the system as a result of nonscheduled service or maintenance calls. All fees are due and payable within thirty (30) days of billing. Payments due to the Contractor and unpaid by the Owner after thirty (30) days shall accrue interest from the due date until paid at a rate of ${T(x.interest_pct)} percent per month.`,
        `b) Within ${T(x.repair_days)} days of receipt of notice of needed repairs pursuant to paragraph 1.e. above, the Owner shall request the Contractor to complete needed repairs or shall provide to the Contractor evidence that the needed repairs were satisfactorily completed by another entity.`,
        'c) The Owner shall provide the Contractor with such access to the system as is reasonably necessary for the Contractor to comply with the terms of this Agreement.',
      ] },
      { h: '3. Term.', p: [
        'This Agreement shall remain in effect until terminated.',
        'a) Automatic Termination. This agreement shall automatically terminate if the Operation Permit for the system is revoked and all appeals of the revocation are exhausted or the time for taking an appeal has passed.',
        'b) Termination by Mutual Consent. The Parties may mutually agree to terminate this Agreement by giving written notice of termination by mutual consent to the local health department thirty (30) days in advance of the date of termination.',
        'c) Termination by the Owner. The Owner may terminate this Agreement by giving notice to the Contractor and to the local health department thirty (30) days in advance of the date of termination.',
        'd) Termination by the Contractor.',
        `1) The Contractor may terminate this Agreement for cause by giving written notice of intent to terminate this Agreement to the Owner and to the local health department thirty (30) days in advance of the date of termination. Cause shall be defined as: failure to remit payment for any bill for services performed under and in accordance with this Agreement if said bill is not paid within thirty (30) days of receipt by the Owner of the bill. If said bill is paid after notice of termination of this Agreement, the Agreement shall continue in effect; or failure of the Owner to provide to the Contractor authorization to complete needed repairs or satisfactory evidence that needed repairs to the system were completed by another entity within ${T(x.repair_days)} days of receipt of notice of needed repairs pursuant to paragraph 1.e. above. If said authorization to complete needed repairs or evidence of completion of said repairs is provided after notice of termination is given but prior to the date of termination of this Agreement, this Agreement shall continue in effect; or failure of the Owner to allow the Contractor such access to the system as is reasonably necessary in order for the Contractor to comply with the terms of this Agreement.`,
        '2) The Contractor may not terminate this Agreement without cause, but may assign its rights and duties under this Agreement as provided in paragraph 4, below.',
      ] },
      { h: '4. Assignment.', p: [
        'a) Assignment by the Owner. The Owner shall notify the Contractor of the name and address of any purchaser of the property on which the system is located. The Owner shall also notify any purchaser of the property on which the system is located of the existence of this Agreement and shall assign all rights and duties under this Agreement to said purchaser.',
        `b) Assignment by the Contractor. The Contractor may assign its rights and duties under this Agreement to another management entity, which is qualified pursuant to ${cite} to manage a Type ${ty} system upon thirty (30) days written notice to the Owner and to the local health department.`,
      ] },
      { h: '5. Use of Subcontractors.', p: ["The Contractor may subcontract with such manufacturers, suppliers and contractors as it deems desirable to perform any of the Contractor's duties under this Agreement. The Contractor shall at all times remain responsible for the performance of and payment for all work performed by all subcontractors."] },
      { h: '6. Representations.', p: ['The Parties represent to each other that each has the power, authority and legal right to enter into and perform its obligations as set forth in this Agreement.'] },
      { h: '7. Regulatory Amendments.', p: ['References in this Agreement to sections of the Administrative Code shall include such rules as they may be amended in the future.'] },
      { h: '8. No Implied Waiver.', p: ['The waiver by either Party, of the default or a breach by the other Party of any provision of this Agreement shall not operate or be construed to operate as a waiver of any subsequent default or breach. The failure at any time of either Party to enforce any provision of this Agreement (a) shall not be construed to be a waiver of such provisions, or of any other provision; and (b) shall not in any way affect the validity of this Agreement, or any part of this Agreement, or the right of either Party thereafter to enforce each and every provision of this Agreement.'] },
      { h: '9. Notice.', p: [
        'Every notice required under this Agreement shall be in writing and shall be deemed sufficiently given if delivered in person or sent by certified or registered mail, return receipt requested, postage prepaid to the Party to be notified and addressed as follows:',
        `To the Owner: ${T(x.owner_name)}, ${T(x.owner_address)}`,
        `To the Contractor: ${T(x.contractor_name)}, ${T(x.contractor_address)}`,
        `To the Local Health Department: ${T(x.health_dept)}`,
        'The date of any Notice shall be the date of personal delivery or the date shown on the return receipt as the date of delivery or attempted delivery, as the case may be. Changes in the respective addresses to which notice may be directed may be made from time to time by either Party by notice to the other party.',
      ] },
      { h: '10. Place of Agreement.', p: ['This Agreement and any questions concerning its validity, the system construction or performance shall be governed by the laws of the State of North Carolina, notwithstanding the place of execution, or the order in which the signatures of the Parties are affixed.'] },
      { h: '11. Entire Agreement and Amendment.', p: ['This Agreement supersedes all prior negotiations, agreements and understandings between the Parties with respect to the subject matter hereof and constitutes the entire Agreement between the Parties with respect to the subject matter hereof. To be effective, any amendment or modification to this Agreement must be in writing and must be signed by the Parties.'] },
      { h: '12. Severability.', p: ['In the event that any provision of this Agreement shall, for any reason, be determined to be invalid, illegal or unenforceable in any respect, the Parties shall negotiate in good faith and agree to such amendments, modifications or supplements of or to this Agreement or such other appropriate actions as shall, to the maximum practicable in light of such determination, implement and give effect to the intentions of the Parties as reflected in this Agreement, and the other provisions of this Agreement shall, as so amended, modified, supplemented or otherwise affected by such actions, remain in full force and effect.'] },
    ],
    closing: 'IN TESTIMONY WHEREOF, the Parties hereto have executed this Agreement in duplicate originals, one of which is retained by each of the Parties, the day and year first above written.',
  };
}
export const REQUIRED = ['owner_name', 'owner_address', 'county', 'system_address', 'sys_type', 'contractor_name', 'contractor_address', 'health_dept', 'annual_fee', 'date'];
