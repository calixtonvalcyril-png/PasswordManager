document.addEventListener('DOMContentLoaded', ()=>{
  const tbody = document.getElementById('PasswordTableBody');
  const addBtn = document.getElementById('AddNew');
  const addForm = document.getElementById('addForm');
  const addCancel = document.getElementById('addCancel');
  const addSubmit = document.getElementById('addSubmit');
  const statusEl = document.getElementById('status');
  const editModal = document.getElementById('editModal');
  const editForm = document.getElementById('editForm');
  const editCancel = document.getElementById('editCancel');
  const editSave = document.getElementById('editSave');

  // in-memory map of current DB rows by id
  const dbMap = Object.create(null);
  let lastStatusTimer = null;
  let activeEditTrigger = null; // element that opened the modal

  function setStatus(msg){
    if(!statusEl) return;
    clearTimeout(lastStatusTimer);
    statusEl.textContent = msg.text || msg;
    statusEl.classList.remove('success','error');
    if(msg.type) statusEl.classList.add(msg.type);
    statusEl.hidden = false;
    lastStatusTimer = setTimeout(()=>{ statusEl.hidden = true; }, 4000);
  }

  // Toggle eye for inputs (add form and edit form)
  function wireEyeToggle(container){
    if(!container) return;
    const btn = container.querySelector('.eye-toggle');
    if(!btn) return;
    const input = container.querySelector('input[type="password"], input[name="password"]');
    if(!input) return;
    btn.addEventListener('click', ()=>{
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      if(pressed){
        input.type = 'password';
        btn.setAttribute('aria-pressed','false');
        btn.textContent = '👁️';
      } else {
        input.type = 'text';
        btn.setAttribute('aria-pressed','true');
        btn.textContent = '🙈';
      }
      input.focus();
    });
  }

  wireEyeToggle(addForm);
  wireEyeToggle(editForm);

  function fetchPasswords(){
    fetch('/api/passwords').then(r=>r.json()).then(data=>{
      tbody.innerHTML = '';
      data.forEach(row => {
        dbMap[row.id] = row;
        appendRow(row);
      });
    }).catch(e=> console.error(e));
  }

  function appendRow(row){
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    const pwdDisplay = row.password ? '••••••••' : 'Not found';
    tr.innerHTML = `<td class="col-website">${escapeHtml(row.website)}</td>
      <td class="col-username">${escapeHtml(row.username)}</td>
      <td class="col-password ${row.password ? '' : 'not-found'}">${escapeHtml(pwdDisplay)}</td>
          <td class="col-actions">
            <button class="toggle-show" data-id="${row.id}" aria-pressed="false" title="Show password">👁️</button>
            <button class="edit" data-id="${row.id}">Edit</button>
            <button class="delete" data-id="${row.id}">Delete</button>
          </td>`;
    tbody.appendChild(tr);
    return tr;
  }

  function escapeHtml(s){
    if(!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  tbody.addEventListener('click', (ev)=>{
    const d = ev.target;
    // Toggle show password in table row
    if(d.matches('button.toggle-show')){
      const id = d.dataset.id;
      const tr = d.closest('tr');
      const pwdCell = tr && tr.querySelector('.col-password');
      if(!pwdCell) return;
      const isShown = d.getAttribute('aria-pressed') === 'true';
      if(isShown){
        // hide again (masked or Not found)
        pwdCell.textContent = dbMap[id] && dbMap[id].password ? '••••••••' : 'Not found';
        pwdCell.classList.toggle('not-found', !(dbMap[id] && dbMap[id].password));
        d.setAttribute('aria-pressed','false');
        d.textContent = '👁️';
      } else {
        // reveal plaintext or Not found
        const plain = dbMap[id] && dbMap[id].password ? dbMap[id].password : 'Not found';
        pwdCell.textContent = plain;
        pwdCell.classList.toggle('not-found', !(dbMap[id] && dbMap[id].password));
        d.setAttribute('aria-pressed','true');
        d.textContent = '🙈';
      }
      return;
    }
    if(d.matches('button.delete')){
      const id = d.dataset.id;
      if(!confirm('Delete this password?')) return;
      fetch('/api/passwords/'+id, {method:'DELETE'}).then(r=>{
        if(r.ok) return r.json(); else throw r;
      }).then(()=>{
        setStatus('Password deleted');
        fetchPasswords();
      }).catch(()=> setStatus('Failed to delete'));
    }

    if(d.matches('button.edit')){
      const id = d.dataset.id;
      openEditModal(id, d);
    }
  });

  if(addBtn){
    addBtn.addEventListener('click', ()=>{
      addForm.classList.remove('hidden');
      addForm.setAttribute('aria-hidden','false');
      addForm.querySelector('input[name="website"]').focus();
    });
  }

  if(addCancel){
    addCancel.addEventListener('click', ()=>{
      addForm.classList.add('hidden');
      addForm.setAttribute('aria-hidden','true');
    });
  }

  addForm.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    const form = ev.target;
    const website = form.website.value.trim();
    const username = form.username.value.trim();
    const password = form.password.value;
    if(!website){ alert('Website is required'); return; }
    fetch('/api/passwords', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({website, username, password})})
    .then(r=> r.ok ? r.json() : r.json().then(j=>Promise.reject(j)))
    .then(record=>{
      setStatus({text:'Added', type:'success'});
      form.reset(); form.classList.add('hidden'); addForm.setAttribute('aria-hidden','true');
      if(record && record.id){ dbMap[record.id]=record; appendRow(record);} else fetchPasswords();
    })
    .catch(err=>{ console.error(err); setStatus({text: err && err.error ? err.error : 'Add failed', type:'error'}); });
  });

  // Edit modal helpers
  function openEditModal(id, trigger){
    const data = dbMap[id];
    if(!data) return setStatus({text:'Record not found', type:'error'});
    activeEditTrigger = trigger || null;
    editForm.id.value = data.id;
    editForm.website.value = data.website || '';
    editForm.username.value = data.username || '';
    editForm.password.value = data.password || '';
    editModal.setAttribute('aria-hidden','false');
    // focus first field
    editForm.website.focus();
    document.addEventListener('keydown', handleModalKey);
  }

  function closeEditModal(){
    editModal.setAttribute('aria-hidden','true');
    document.removeEventListener('keydown', handleModalKey);
    if(activeEditTrigger) activeEditTrigger.focus();
    activeEditTrigger = null;
  }

  function handleModalKey(e){
    if(e.key === 'Escape') closeEditModal();
  }

  if(editCancel){
    editCancel.addEventListener('click', ()=> closeEditModal());
  }

  // clicking overlay closes
  if(editModal){
    editModal.addEventListener('click', (ev)=>{
      if(ev.target && ev.target.classList && ev.target.classList.contains('modal-overlay')) closeEditModal();
    });
  }

  if(editForm){
    editForm.addEventListener('submit', (ev)=>{
      ev.preventDefault();
      const id = editForm.id.value;
      const website = editForm.website.value.trim();
      const username = editForm.username.value.trim();
      const password = editForm.password.value;
      if(!website){ setStatus({text:'Website is required', type:'error'}); editForm.website.focus(); return; }
      fetch('/api/passwords/'+id, {method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({website, username, password})})
      .then(r=> r.ok ? r.json() : r.json().then(j=>Promise.reject(j)))
      .then(updated=>{
        dbMap[updated.id] = updated;
        updateRowInDOM(updated);
        setStatus({text:'Saved', type:'success'});
        closeEditModal();
      }).catch(err=>{ console.error(err); setStatus({text: err && err.error ? err.error : 'Save failed', type:'error'}); });
    });
  }

  function updateRowInDOM(row){
    const tr = tbody.querySelector(`tr[data-id="${row.id}"]`);
    if(!tr) return; // row might not be present if filtered
    const elWebsite = tr.querySelector('.col-website');
    const elUsername = tr.querySelector('.col-username');
    const elPassword = tr.querySelector('.col-password');
    if(elWebsite) elWebsite.textContent = row.website;
    if(elUsername) elUsername.textContent = row.username;
    if(elPassword){
      elPassword.textContent = row.password ? '••••••••' : 'Not found';
      elPassword.classList.toggle('not-found', !row.password);
    }
    // No created/modified columns — function updates only visible fields
  }

  // Search handling: highlight matching rows and report counts
  const searchForm = document.querySelector('.search-form');
  const searchInput = document.getElementById('searchInput');
  if(searchForm){
    function runSearch(query){
      const q = (query||'').trim().toLowerCase();
      const rows = Array.from(tbody.querySelectorAll('tr'));
      let matches = 0;
      rows.forEach(r=>{
        r.classList.remove('highlight');
        const site = (r.querySelector('.col-website') && r.querySelector('.col-website').textContent || '').toLowerCase();
        const user = (r.querySelector('.col-username') && r.querySelector('.col-username').textContent || '').toLowerCase();
        if(q && (site.includes(q) || user.includes(q))){
          r.classList.add('highlight');
          matches++;
        }
      });
      if(q){
        if(matches === 0) setStatus({text:'No results', type:'error'});
        else setStatus({text: matches + (matches===1? ' result' : ' results'), type:'success'});
      } else {
        // clear status when empty
        setStatus({text:'', type:''});
      }
      // return first match DOM element for potential scrolling
      return rows.find(r=> r.classList.contains('highlight')) || null;
    }

    searchForm.addEventListener('submit', (ev)=>{ ev.preventDefault(); const first = runSearch(searchInput.value); if(first) first.scrollIntoView({behavior:'smooth', block:'center'}); });
    searchInput.addEventListener('input', ()=> runSearch(searchInput.value));
  }

  fetchPasswords();
});

// small helper for injection safety
function escapeHtml(s){ if(!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
