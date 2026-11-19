import { useCallback, useEffect, useState } from 'react';
import { BellRing, Check, Clock3, Mail, MessageCircle, RefreshCw, Save, Send, ShieldCheck } from 'lucide-react';
import API from '../services/api';

const TRIGGER_HELP = {
  membership_expiring: 'Send before the membership expiry date.',
  balance_overdue: 'Uses the membership expiry date as the due date and checks for an unpaid balance.',
  inactive_member: 'Reach active members with no check-in during the selected number of days.',
  new_lead: 'Follow up with new leads after the selected number of days (0 means the day they are added).',
};
const STATUS_LABELS = { sent: 'Sent', simulated: 'Previewed', pending: 'Queued', sending: 'Sending', failed: 'Failed', cancelled: 'Cancelled' };

export default function CommunicationAutomations() {
  const [data, setData] = useState({ rules: [], recentMessages: [], contactsWithPreferences: 0, emailConfigured: false, whatsappMode: 'simulation' });
  const [contacts, setContacts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [consentDrafts, setConsentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [settings, contactResponse] = await Promise.all([
        API.get('/communication-automations/settings'),
        API.get('/communication-automations/contacts'),
      ]);
      setData(settings.data);
      setContacts(contactResponse.data || []);
      setDrafts(Object.fromEntries((settings.data.rules || []).map(rule => [rule.trigger, { ...rule }])));
      setConsentDrafts(Object.fromEntries((contactResponse.data || []).map(contact => [contact.id, {
        emailOptIn: contact.preferences?.emailOptIn || false,
        whatsappOptIn: contact.preferences?.whatsappOptIn || false,
        consentSource: contact.preferences?.consentSource || '',
      }])));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load communication settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRule = async (trigger) => {
    setBusy(`rule:${trigger}`); setError(''); setNotice('');
    try {
      await API.put(`/communication-automations/rules/${trigger}`, drafts[trigger]);
      setNotice('Automation rule saved.'); await load();
    } catch (err) { setError(err.response?.data?.message || 'Could not save this rule.'); }
    finally { setBusy(''); }
  };

  const saveConsent = async (contact) => {
    setBusy(`contact:${contact.id}`); setError(''); setNotice('');
    try {
      await API.put(`/communication-automations/contacts/${contact.type}/${contact.id}/preferences`, consentDrafts[contact.id]);
      setNotice(`Communication preferences saved for ${contact.name}.`); await load();
    } catch (err) { setError(err.response?.data?.message || 'Could not save contact preferences.'); }
    finally { setBusy(''); }
  };

  const sendTest = async () => {
    setBusy('test'); setNotice(''); setError('');
    try {
      const { data: result } = await API.post('/communication-automations/test-email');
      setNotice(result.status === 'simulated' ? 'SMTP is not configured yet. The test was logged as a simulation.' : `Test email sent to ${result.recipient}.`);
      await load();
    } catch (err) { setError(err.response?.data?.message || 'Email test failed. Check SMTP settings.'); }
    finally { setBusy(''); }
  };

  const updateDraft = (trigger, field, value) => setDrafts(current => ({ ...current, [trigger]: { ...current[trigger], [field]: value } }));
  const updateConsent = (contactId, field, value) => setConsentDrafts(current => ({ ...current, [contactId]: { ...current[contactId], [field]: value } }));

  return <main style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px 64px', color: '#241f18' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
      <div><p style={{ margin: 0, color: '#786f61', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Member relationships</p><h1 style={{ margin: '8px 0', fontSize: 32 }}>Automations & outreach</h1><p style={{ margin: 0, color: '#716b61' }}>Set up timely member reminders and lead follow-ups across your gym.</p></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={sendTest} disabled={Boolean(busy)} style={buttonStyle}><Send size={16} />{busy === 'test' ? 'Sending…' : 'Send test email'}</button>
        <button onClick={load} disabled={loading || Boolean(busy)} style={buttonStyle}><RefreshCw size={16} />Refresh</button>
      </div>
    </header>

    {(notice || error) && <div role={error ? 'alert' : 'status'} style={{ ...bannerStyle, background: error ? '#fff0ed' : '#eef8f0', color: error ? '#a3311d' : '#27633b' }}>{error || notice}</div>}

    <section style={{ ...panelStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16, marginBottom: 22 }}>
      <StatusCard icon={<Mail size={18} />} title="Email" value={data.emailConfigured ? 'SMTP connected' : 'Simulation mode'} detail={data.emailConfigured ? 'Test email goes to your staff login address.' : 'Add SMTP settings to backend/.env to send real email.'} />
      <StatusCard icon={<MessageCircle size={18} />} title="WhatsApp" value="Preview only" detail="Messages are queued and logged; no provider calls are made yet." />
      <StatusCard icon={<ShieldCheck size={18} />} title="Contact preferences" value={`${data.contactsWithPreferences || 0} recorded`} detail="Automations only send when consent is recorded for that channel." />
    </section>

    <section style={{ marginBottom: 28 }}>
      <SectionHeading icon={<BellRing size={18} />} title="Automation rules" subtitle="Rules start paused. Enable a rule after reviewing its timing and message." />
      {loading ? <div style={panelStyle}>Loading rules…</div> : <div style={{ display: 'grid', gap: 14 }}>{(data.rules || []).map(rule => {
        const draft = drafts[rule.trigger] || rule;
        return <article key={rule.id} style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div><h3 style={{ margin: 0, fontSize: 18 }}>{rule.name}</h3><p style={{ margin: '6px 0 0', color: '#766f65', fontSize: 13 }}>{TRIGGER_HELP[rule.trigger]}</p></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14 }}><input type="checkbox" checked={Boolean(draft.enabled)} onChange={event => updateDraft(rule.trigger, 'enabled', event.target.checked)} />{draft.enabled ? 'Enabled' : 'Paused'}</label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,0.6fr) minmax(150px,0.6fr) minmax(200px,1fr)', gap: 12, marginTop: 18 }}>
            <label style={fieldStyle}><span><Clock3 size={14} />{rule.trigger === 'membership_expiring' ? 'Days before expiry' : rule.trigger === 'new_lead' ? 'Days after lead' : rule.trigger === 'balance_overdue' ? 'Days overdue' : 'Days without check-in'}</span><input type="number" min="0" max="365" value={draft.days} onChange={event => updateDraft(rule.trigger, 'days', Number(event.target.value))} /></label>
            <label style={fieldStyle}><span>Delivery channel</span><select value={draft.channel} onChange={event => updateDraft(rule.trigger, 'channel', event.target.value)}><option value="email">Email</option><option value="whatsapp">WhatsApp (preview)</option><option value="both">Email + WhatsApp</option></select></label>
            <label style={fieldStyle}><span>Email subject</span><input value={draft.subject || ''} onChange={event => updateDraft(rule.trigger, 'subject', event.target.value)} maxLength={200} /></label>
          </div>
          <label style={{ ...fieldStyle, marginTop: 12 }}><span>Message <small style={{ fontWeight: 500, color: '#857c70' }}>Use {'{{name}}'}, {'{{gymName}}'}, {'{{days}}'}, {'{{expiryDate}}'}, {'{{amountDue}}'}</small></span><textarea rows={3} value={draft.message || ''} onChange={event => updateDraft(rule.trigger, 'message', event.target.value)} maxLength={2000} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button style={buttonStyle} disabled={Boolean(busy)} onClick={() => saveRule(rule.trigger)}><Save size={16} />{busy === `rule:${rule.trigger}` ? 'Saving…' : 'Save rule'}</button></div>
        </article>;
      })}</div>}
    </section>

    <section style={{ marginBottom: 28 }}>
      <SectionHeading icon={<ShieldCheck size={18} />} title="Member and lead consent" subtitle="Record consent only after the contact has agreed to receive messages through that channel." />
      <div style={{ ...panelStyle, overflowX: 'auto', padding: 0 }}>
        {loading ? <p style={{ padding: 18 }}>Loading contacts…</p> : <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr>{['Contact', 'Type', 'Email', 'Phone', 'Email consent', 'WhatsApp consent', 'Consent source', ''].map(label => <th key={label} style={thStyle}>{label}</th>)}</tr></thead>
          <tbody>{contacts.map(contact => {
            const draft = consentDrafts[contact.id] || {};
            return <tr key={`${contact.type}-${contact.id}`}>
              <td style={tdStyle}><strong>{contact.name}</strong></td><td style={tdStyle}>{contact.type}</td><td style={tdStyle}>{contact.email || '—'}</td><td style={tdStyle}>{contact.phone || '—'}</td>
              <td style={tdStyle}><input aria-label={`Email consent for ${contact.name}`} type="checkbox" checked={Boolean(draft.emailOptIn)} onChange={event => updateConsent(contact.id, 'emailOptIn', event.target.checked)} /></td>
              <td style={tdStyle}><input aria-label={`WhatsApp consent for ${contact.name}`} type="checkbox" checked={Boolean(draft.whatsappOptIn)} onChange={event => updateConsent(contact.id, 'whatsappOptIn', event.target.checked)} /></td>
              <td style={tdStyle}><input aria-label={`Consent source for ${contact.name}`} placeholder="e.g. signup form" value={draft.consentSource || ''} onChange={event => updateConsent(contact.id, 'consentSource', event.target.value)} style={{ ...inputStyle, minWidth: 130 }} /></td>
              <td style={tdStyle}><button title="Save preferences" style={smallButtonStyle} disabled={Boolean(busy)} onClick={() => saveConsent(contact)}>{busy === `contact:${contact.id}` ? '…' : <Check size={15} />}</button></td>
            </tr>;
          })}{contacts.length === 0 && <tr><td colSpan={8} style={{ ...tdStyle, padding: 24, textAlign: 'center', color: '#777' }}>No members or active leads found.</td></tr>}</tbody>
        </table>}
      </div>
    </section>

    <section>
      <SectionHeading icon={<Clock3 size={18} />} title="Recent message activity" subtitle="Queued, sent, simulated, and failed messages for this gym." />
      <div style={{ ...panelStyle, overflowX: 'auto', padding: 0 }}><table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr>{['Created', 'Channel', 'Recipient', 'Subject / message', 'Status'].map(label => <th key={label} style={thStyle}>{label}</th>)}</tr></thead><tbody>
        {(data.recentMessages || []).map(item => <tr key={item.id}><td style={tdStyle}>{new Date(item.createdAt).toLocaleString()}</td><td style={tdStyle}>{item.channel}</td><td style={tdStyle}>{item.recipient}</td><td style={{ ...tdStyle, maxWidth: 420 }}><div style={{ fontWeight: 700 }}>{item.subject || 'WhatsApp message'}</div><div style={{ color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.error || item.body}</div></td><td style={tdStyle}><span style={statusPill(item.status)}>{STATUS_LABELS[item.status] || item.status}</span></td></tr>)}
        {(!data.recentMessages || !data.recentMessages.length) && <tr><td colSpan={5} style={{ ...tdStyle, padding: 24, textAlign: 'center', color: '#777' }}>No messages have been queued yet.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}

function SectionHeading({ icon, title, subtitle }) { return <div style={{ margin: '0 0 12px' }}><h2 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0, fontSize: 20 }}>{icon}{title}</h2><p style={{ margin: '5px 0 0', color: '#766f65', fontSize: 13 }}>{subtitle}</p></div>; }
function StatusCard({ icon, title, value, detail }) { return <div style={{ padding: '15px 16px', borderRadius: 12, background: '#f8f6f1' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#786f61', fontSize: 13 }}>{icon}{title}</div><strong style={{ display: 'block', marginTop: 8 }}>{value}</strong><div style={{ marginTop: 4, color: '#777064', fontSize: 12, lineHeight: 1.5 }}>{detail}</div></div>; }
const panelStyle = { background: '#fff', border: '1px solid #e8e2d8', borderRadius: 14, padding: 18, boxShadow: '0 8px 28px rgba(55,43,25,0.04)' };
const buttonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 9, border: '1px solid #d8d0c4', background: '#fff', color: '#2b261e', fontWeight: 700, cursor: 'pointer' };
const smallButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 32, borderRadius: 8, border: '1px solid #d8d0c4', background: '#fff', cursor: 'pointer' };
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 6, color: '#655d51', fontSize: 12, fontWeight: 700 };
const inputStyle = { padding: '8px 10px', border: '1px solid #ded7cb', borderRadius: 8, color: '#2b261e', background: '#fff' };
const thStyle = { padding: '12px 13px', borderBottom: '1px solid #eee9e1', background: '#faf9f6', color: '#746d61', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '12px 13px', borderBottom: '1px solid #f0ede7', fontSize: 13, verticalAlign: 'middle' };
const bannerStyle = { marginBottom: 18, padding: '12px 15px', borderRadius: 10, fontSize: 14, fontWeight: 600 };
const statusPill = (status) => ({ display: 'inline-block', padding: '4px 8px', borderRadius: 20, background: status === 'sent' ? '#e8f5ea' : status === 'failed' ? '#fff0ed' : '#f1f0ed', color: status === 'sent' ? '#28643a' : status === 'failed' ? '#a3311d' : '#5f594f', fontWeight: 700, fontSize: 11 });
