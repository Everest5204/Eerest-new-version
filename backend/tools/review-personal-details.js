// Run with mongosh, using a staff database credential. No client approval endpoint.
// DB_NAME, REVIEW_ACTION=list|setup|approve|reject, REVIEW_USER_ID, REVIEW_FIELD,
// REVIEW_REQUEST_ID, REVIEWER and optional REVIEW_NOTE are environment variables.
(async () => {
  const env = process.env;
  if (!env.DB_NAME) throw new Error('Set DB_NAME to the application database name.');
  const users = db.getSiblingDB(env.DB_NAME).getCollection('users');
  const action = env.REVIEW_ACTION || 'list';
  const pending = { $or: [
    { 'personal_details_requests.birth_date.status': 'pending' },
    { 'personal_details_requests.gender.status': 'pending' }
  ] };
  if (action === 'setup') {
    for (const field of ['birth_date', 'gender']) {
      const keys = {};
      keys['personal_details_requests.' + field + '.status'] = 1;
      keys['personal_details_requests.' + field + '.created_at'] = 1;
      await users.createIndex(keys, { name: 'personal_details_review_' + field });
    }
    print('Review queue indexes ready.');
    return;
  }
  if (action === 'list') {
    const rows = await users.find(pending, {
      first_name: 1, last_name: 1, personal_details_requests: 1
    }).limit(100).toArray();
    printjson(rows);
    return;
  }
  if (!['approve', 'reject'].includes(action)) throw new Error('Unsupported REVIEW_ACTION.');
  const field = env.REVIEW_FIELD;
  if (!['birth_date', 'gender'].includes(field)) throw new Error('REVIEW_FIELD must be birth_date or gender.');
  if (!/^[a-f0-9]{24}$/.test(env.REVIEW_USER_ID || '')) throw new Error('Invalid REVIEW_USER_ID.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(env.REVIEW_REQUEST_ID || '')) throw new Error('Invalid REVIEW_REQUEST_ID.');
  if (!env.REVIEWER || env.REVIEWER.length > 120) throw new Error('Set REVIEWER to the staff identifier.');
  const note = (env.REVIEW_NOTE || '').trim();
  if (Array.from(note).length > 500) throw new Error('REVIEW_NOTE must be at most 500 characters.');
  const id = ObjectId(env.REVIEW_USER_ID);
  const path = 'personal_details_requests.' + field;
  const filter = { _id: id, deactivated: { $ne: true }, deletion_requested: { $ne: true } };
  filter[path + '.id'] = env.REVIEW_REQUEST_ID;
  filter[path + '.status'] = 'pending';
  const user = await users.findOne(filter, { gender: 1, birth_year: 1, birth_month: 1, birth_day: 1, personal_details_requests: 1 });
  if (!user) throw new Error('No matching pending request on an active account. Nothing changed.');
  const request = user.personal_details_requests[field];
  const now = new Date();
  const set = { updated_at: now };
  set[path + '.status'] = action === 'approve' ? 'approved' : 'rejected';
  set[path + '.reviewed_at'] = now;
  set[path + '.reviewed_by'] = env.REVIEWER;
  set[path + '.review_note'] = note;
  if (action === 'approve') {
    const proposed = request.proposed_value;
    let before = user.gender || '';
    if (field === 'birth_date') {
      const y = Number(user.birth_year || 0), m = Number(user.birth_month || 0), d = Number(user.birth_day || 0);
      const current = new Date(Date.UTC(y, m - 1, d));
      before = y >= 1900 && m >= 1 && m <= 12 && d >= 1 && current.getUTCFullYear() === y && current.getUTCMonth() + 1 === m && current.getUTCDate() === d && current <= now ? current.toISOString().slice(0, 10) : '';
      for (const key of ['birth_year', 'birth_month', 'birth_day']) filter[key] = user[key] === undefined ? { $exists: false } : user[key];
      if (proposed !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(proposed)) throw new Error('Invalid proposed birthday.');
      const date = proposed ? new Date(proposed + 'T00:00:00Z') : null;
      if (date && (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== proposed || date.getUTCFullYear() < 1900 || date > now)) throw new Error('Invalid proposed birthday.');
      set.birth_year = date ? date.getUTCFullYear() : 0;
      set.birth_month = date ? date.getUTCMonth() + 1 : 0;
      set.birth_day = date ? date.getUTCDate() : 0;
    } else {
      if (!['', 'male', 'female', 'other'].includes(proposed)) throw new Error('Invalid proposed gender.');
      filter.gender = user.gender === undefined ? { $exists: false } : user.gender;
      set.gender = proposed;
    }
    if (before !== request.current_value) throw new Error('The identity value changed since submission. Review the newer value before deciding. Nothing changed.');
    filter[path + '.proposed_value'] = proposed;
    filter[path + '.current_value'] = request.current_value;
  }
  const result = await users.updateOne(filter, { $set: set, $inc: { personal_details_revision: Long(1) } });
  if (result.modifiedCount !== 1) throw new Error('Request or account changed concurrently. Nothing changed; reload the queue.');
  print(action === 'approve' ? 'Approved. Canonical details and request status updated atomically.' : 'Rejected. Canonical details retained.');
})().catch(error => { console.error(error.message); quit(1); });
