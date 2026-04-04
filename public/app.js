// ===== app.js — Application Logic =====
// Runs after tree.js. No ES modules.

var state = {
  people: [],
  relationships: [],
  selectedPersonId: null,
  editingPersonId: null,
  photoFilename: null
};

// ============================================================
// Utilities
// ============================================================

function personById(id) {
  var sid = String(id);
  for (var i = 0; i < state.people.length; i++) {
    if (String(state.people[i].id) === sid) {
      return state.people[i];
    }
  }
  return null;
}

function personName(id) {
  var p = personById(id);
  if (!p) return 'לא ידוע';
  return ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
}

function formatDate(str) {
  if (!str) return '';
  try {
    var parts = str.split('-');
    if (parts.length === 3) {
      var months = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
      var d = parseInt(parts[2], 10);
      var m = parseInt(parts[1], 10) - 1;
      var y = parseInt(parts[0], 10);
      return d + ' ' + months[m] + ' ' + y;
    }
    return str;
  } catch(e) {
    return str;
  }
}

function yearFrom(str) {
  if (!str) return null;
  return str.slice(0, 4);
}

function showError(msg) {
  alert('שגיאה: ' + msg);
}

// ============================================================
// API helpers
// ============================================================

function _apiUrl(path) {
  var base = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '';
  return base + path;
}

function _authHeaders(extra) {
  var token = sessionStorage.getItem('ft_token') || '';
  var h = { 'Authorization': 'Bearer ' + token };
  if (extra) Object.assign(h, extra);
  return h;
}

function apiGet(url) {
  return fetch(_apiUrl(url), { headers: _authHeaders() }).then(function(r) { return r.json(); });
}

function apiPost(url, data) {
  return fetch(_apiUrl(url), {
    method: 'POST',
    headers: _authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  }).then(function(r) { return r.json(); });
}

function apiPut(url, data) {
  return fetch(_apiUrl(url), {
    method: 'PUT',
    headers: _authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  }).then(function(r) { return r.json(); });
}

function apiDelete(url) {
  return fetch(_apiUrl(url), { method: 'DELETE', headers: _authHeaders() }).then(function(r) { return r.json(); });
}

// ============================================================
// Refresh tree
// ============================================================

function refreshTree() {
  return apiGet('/api/tree').then(function(data) {
    state.people = data.people || [];
    state.relationships = data.relationships || [];
    window.renderTree(state.people, state.relationships);
    refreshUpcomingWidget();

    // Re-highlight search
    var searchTerm = document.getElementById('search-input').value.trim();
    if (searchTerm) window.highlightSearch(searchTerm);

    // Re-mark selected
    if (state.selectedPersonId) {
      window.markSelectedPerson(state.selectedPersonId);
    }
  });
}

// ============================================================
// Person Panel
// ============================================================

function showPersonPanel(id) {
  var person = personById(id);
  if (!person) return;

  state.selectedPersonId = id;
  window.markSelectedPerson(id);

  var panel = document.getElementById('person-panel');
  panel.classList.remove('hidden');

  // Photo
  var photoEl = document.getElementById('panel-photo');
  var initialsEl = document.getElementById('panel-initials');

  if (person.photo) {
    photoEl.src = person.photo.startsWith('http') ? person.photo : '/uploads/' + person.photo;
    photoEl.alt = personName(id);
    photoEl.classList.remove('hidden');
    initialsEl.style.display = 'none';
  } else {
    photoEl.classList.add('hidden');
    initialsEl.style.display = 'flex';
    var initials = ((person.first_name || '?')[0] + (person.last_name || '?')[0]).toUpperCase();
    initialsEl.textContent = initials;

    // Color based on gender
    var genderColors = { M: '#bee3f8', F: '#fed7e2', Other: '#e2e8f0' };
    initialsEl.style.background = genderColors[person.gender] || '#e2e8f0';
  }

  // Name (+ ז"ל if deceased)
  var displayName = personName(id);
  if (person.is_deceased || person.death_date) displayName += ' ז"ל';
  document.getElementById('panel-name').textContent = displayName;

  // Gender badge
  var badge = document.getElementById('panel-gender');
  badge.className = 'gender-badge';
  var genderLabels = { M: 'זכר', F: 'נקבה' };
  badge.textContent = genderLabels[person.gender] || 'זכר';
  var genderClasses = { M: 'male', F: 'female' };
  badge.classList.add(genderClasses[person.gender] || 'male');

  // Dates
  var datesEl = document.getElementById('panel-dates');
  var dateParts = [];
  if (person.birth_date) dateParts.push('נולד/ה: ' + formatDate(person.birth_date));
  if (person.death_date) dateParts.push('נפטר/ה: ' + formatDate(person.death_date));
  datesEl.textContent = dateParts.join('  ·  ');

  // Notes
  var notesEl = document.getElementById('panel-notes');
  notesEl.textContent = person.notes || '';

  // Relationships list
  var relList = document.getElementById('panel-rel-list');
  relList.innerHTML = '';

  state.relationships.forEach(function(r) {
    var relatedId = null;
    var label = '';

    if (r.type === 'parent') {
      if (r.person1_id === id) {
        relatedId = r.person2_id;
        label = 'ילד/ה';
      } else if (r.person2_id === id) {
        relatedId = r.person1_id;
        label = 'הורה';
      }
    } else if (r.type === 'spouse') {
      if (r.person1_id === id) {
        relatedId = r.person2_id;
        label = 'בן/בת זוג';
      } else if (r.person2_id === id) {
        relatedId = r.person1_id;
        label = 'בן/בת זוג';
      }
    }

    if (relatedId === null) return;

    var li = document.createElement('li');

    var typeBadge = document.createElement('span');
    typeBadge.className = 'rel-type-badge';
    typeBadge.textContent = label;
    li.appendChild(typeBadge);

    var nameLink = document.createElement('span');
    nameLink.className = 'rel-name-link';
    nameLink.textContent = personName(relatedId);
    (function(rid) {
      nameLink.addEventListener('click', function() { showPersonPanel(rid); });
    })(relatedId);
    li.appendChild(nameLink);

    // Delete relationship button
    var delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'הסר קשר';
    delBtn.style.cssText = 'margin-right:auto;background:none;border:none;color:#f56565;cursor:pointer;font-size:14px;padding:0 4px;';
    (function(rid) {
      delBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (confirm('להסיר קשר זה?')) {
          apiDelete('/api/relationships/' + rid).then(function() {
            refreshTree().then(function() {
              showPersonPanel(state.selectedPersonId);
            });
          });
        }
      });
    })(r.id);
    li.appendChild(delBtn);

    relList.appendChild(li);
  });

  // Siblings section — inferred via parent+spouse relationships
  var siblingsSection = document.getElementById('panel-siblings');
  var siblingsList = document.getElementById('panel-siblings-list');
  siblingsList.innerHTML = '';

  // Find direct parents of current person
  var myParentIds = [];
  state.relationships.forEach(function(r) {
    if (r.type === 'parent' && r.person2_id === id) {
      myParentIds.push(r.person1_id);
    }
  });

  // Expand to include spouses of those parents (the full parent unit)
  var parentUnitIds = myParentIds.slice();
  myParentIds.forEach(function(pid) {
    state.relationships.forEach(function(r) {
      if (r.type === 'spouse') {
        if (r.person1_id === pid && parentUnitIds.indexOf(r.person2_id) === -1) parentUnitIds.push(r.person2_id);
        if (r.person2_id === pid && parentUnitIds.indexOf(r.person1_id) === -1) parentUnitIds.push(r.person1_id);
      }
    });
  });

  // All children of the parent unit (excluding self) = siblings
  var siblingSet = {};
  if (parentUnitIds.length > 0) {
    state.relationships.forEach(function(r) {
      if (r.type === 'parent' && r.person2_id !== id && parentUnitIds.indexOf(r.person1_id) !== -1) {
        siblingSet[r.person2_id] = true;
      }
    });
  }

  var siblingIds = Object.keys(siblingSet);
  siblingsSection.style.display = siblingIds.length > 0 ? '' : 'none';
  siblingIds.forEach(function(sid) {
    var li = document.createElement('li');
    var nameLink = document.createElement('span');
    nameLink.className = 'rel-name-link';
    nameLink.textContent = personName(sid);
    (function(sibId) {
      nameLink.addEventListener('click', function() { showPersonPanel(sibId); });
    })(sid);
    li.appendChild(nameLink);
    siblingsList.appendChild(li);
  });

  // Add connection button
  document.getElementById('btn-panel-add-rel').onclick = function() {
    openRelModal(id);
  };

  // Edit button
  document.getElementById('btn-edit-person').onclick = function() {
    openEditPersonModal(id);
  };

  // Delete button
  document.getElementById('btn-delete-person').onclick = function() {
    if (confirm('למחוק את ' + personName(id) + '? פעולה זו תסיר גם את כל הקשרים שלהם.')) {
      apiDelete('/api/people/' + id).then(function(data) {
        if (data.error) { showError(data.error); return; }
        state.selectedPersonId = null;
        closePersonPanel();
        refreshTree();
      });
    }
  };
}

function closePersonPanel() {
  state.selectedPersonId = null;
  window.markSelectedPerson(null);
  document.getElementById('person-panel').classList.add('hidden');
}

function setupPanelPhotoUpload() {
  var editEl   = document.getElementById('panel-photo-edit');
  var inputEl  = document.getElementById('panel-photo-input');

  editEl.addEventListener('click', function() {
    if (state.selectedPersonId) inputEl.click();
  });

  inputEl.addEventListener('change', function() {
    var file = inputEl.files[0];
    if (!file || !state.selectedPersonId) return;
    var id = state.selectedPersonId;
    inputEl.value = '';

    resizeImage(file, 1200, 0.85, function(blob, mimeType) {
      var cfg = window.APP_CONFIG || {};
      var doUpload = cfg.usePresignedUpload
        ? apiPost('/api/upload-url', { filename: file.name, contentType: mimeType })
            .then(function(data) {
              if (data.error) throw new Error(data.error);
              return fetch(data.uploadUrl, {
                method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob
              }).then(function(r) {
                if (!r.ok) throw new Error('Upload failed: ' + r.status);
                return data.photoUrl;
              });
            })
        : (function() {
            var formData = new FormData();
            formData.append('photo', blob, file.name);
            return fetch('/api/upload', { method: 'POST', body: formData })
              .then(function(r) { return r.json(); })
              .then(function(d) {
                if (d.error) throw new Error(d.error);
                return d.filename;
              });
          })();

      doUpload.then(function(photoValue) {
        return apiPut('/api/people/' + id, { photo: photoValue });
      }).then(function(person) {
        if (person.error) { showError(person.error); return; }
        refreshTree().then(function() { showPersonPanel(id); });
      }).catch(function(err) {
        showError('שגיאת העלאה: ' + err.message);
      });
    });
  });
}

// ============================================================
// Modal helpers
// ============================================================

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ============================================================
// Person Modal
// ============================================================

function _populateSpouseSelect(preselectedId) {
  var sel = document.getElementById('inp-spouse');
  sel.innerHTML = '<option value="">— ללא בן/בת זוג —</option>';
  var sorted = state.people.slice().sort(function(a, b) {
    var an = ((a.first_name || '') + ' ' + (a.last_name || '')).trim();
    var bn = ((b.first_name || '') + ' ' + (b.last_name || '')).trim();
    return an.localeCompare(bn, 'he');
  });
  sorted.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
    if (p.id === preselectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function _populateParentSelect(preselectedId) {
  var sel = document.getElementById('inp-parent');
  sel.innerHTML = '<option value="">— ללא הורה —</option>';
  var sorted = state.people.slice().sort(function(a, b) {
    var an = ((a.first_name || '') + ' ' + (a.last_name || '')).trim();
    var bn = ((b.first_name || '') + ' ' + (b.last_name || '')).trim();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
  sorted.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = personName(p.id);
    if (p.id === preselectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function openAddPersonModal(preselectedParentId) {
  state.editingPersonId = null;
  state.photoFilename = null;

  document.getElementById('modal-person-title').textContent = 'הוסף אדם';
  document.getElementById('inp-first-name').value = '';
  document.getElementById('inp-last-name').value = '';
  document.getElementById('inp-gender').value = 'M';
  document.getElementById('inp-birth-date').value = '';
  document.getElementById('inp-death-date').value = '';
  document.getElementById('inp-deceased').checked = false;
  document.getElementById('inp-notes').value = '';

  // Parent + spouse selectors — show only when adding
  document.getElementById('inp-parent-wrap').style.display = '';
  document.getElementById('inp-spouse-wrap').style.display = '';
  _populateParentSelect(preselectedParentId || null);
  _populateSpouseSelect(null);

  // Reset photo
  var preview = document.getElementById('photo-preview');
  var placeholder = document.getElementById('photo-placeholder');
  preview.src = '';
  preview.classList.add('hidden');
  placeholder.style.display = 'flex';

  openModal('modal-person');
  document.getElementById('inp-first-name').focus();
}

function openEditPersonModal(id) {
  var person = personById(id);
  if (!person) return;

  state.editingPersonId = id;
  state.photoFilename = person.photo || null;

  document.getElementById('modal-person-title').textContent = 'ערוך אדם';
  document.getElementById('inp-first-name').value = person.first_name || '';
  document.getElementById('inp-last-name').value = person.last_name || '';
  document.getElementById('inp-gender').value = (person.gender === 'F') ? 'F' : 'M';
  document.getElementById('inp-birth-date').value = person.birth_date || '';
  document.getElementById('inp-death-date').value = person.death_date || '';
  document.getElementById('inp-deceased').checked = !!(person.is_deceased || person.death_date);
  document.getElementById('inp-notes').value = person.notes || '';

  // Photo preview
  var preview = document.getElementById('photo-preview');
  var placeholder = document.getElementById('photo-placeholder');
  if (person.photo) {
    preview.src = person.photo.startsWith('http') ? person.photo : '/uploads/' + person.photo;
    preview.classList.remove('hidden');
    placeholder.style.display = 'none';
  } else {
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.style.display = 'flex';
  }

  // Hide parent + spouse selectors when editing
  document.getElementById('inp-parent-wrap').style.display = 'none';
  document.getElementById('inp-spouse-wrap').style.display = 'none';

  // Show marriage dates for existing spouses
  var spouseRels = state.relationships.filter(function(r) {
    return r.type === 'spouse' && (r.person1_id === id || r.person2_id === id);
  });
  var datesWrap = document.getElementById('inp-spouse-dates-wrap');
  var datesList = document.getElementById('inp-spouse-dates-list');
  datesList.innerHTML = '';
  if (spouseRels.length > 0) {
    spouseRels.forEach(function(rel) {
      var spouseId = rel.person1_id === id ? rel.person2_id : rel.person1_id;
      var spouse = personById(spouseId);
      var spouseName = spouse ? ((spouse.first_name || '') + ' ' + (spouse.last_name || '')).trim() : spouseId;
      var row = document.createElement('div');
      row.className = 'form-row';
      row.innerHTML =
        '<div class="form-group" style="flex:1">' +
          '<label>תאריך נישואין עם ' + spouseName + '</label>' +
          '<input type="date" data-rel-id="' + rel.id + '" data-field="start_date" value="' + (rel.start_date || '') + '">' +
        '</div>' +
        '<div class="form-group" style="flex:1">' +
          '<label>תאריך פרידה</label>' +
          '<input type="date" data-rel-id="' + rel.id + '" data-field="end_date" value="' + (rel.end_date || '') + '">' +
        '</div>';
      datesList.appendChild(row);
    });
    datesWrap.style.display = '';
  } else {
    datesWrap.style.display = 'none';
  }

  openModal('modal-person');
  document.getElementById('inp-first-name').focus();
}

function savePersonModal() {
  var firstName = document.getElementById('inp-first-name').value.trim();
  if (!firstName) {
    document.getElementById('inp-first-name').focus();
    document.getElementById('inp-first-name').style.borderColor = '#f56565';
    return;
  }
  document.getElementById('inp-first-name').style.borderColor = '';

  var data = {
    first_name: firstName,
    last_name: document.getElementById('inp-last-name').value.trim(),
    gender: document.getElementById('inp-gender').value,
    birth_date: document.getElementById('inp-birth-date').value || null,
    death_date: document.getElementById('inp-death-date').value || null,
    is_deceased: document.getElementById('inp-deceased').checked ? 1 : 0,
    notes: document.getElementById('inp-notes').value.trim() || null,
    photo: state.photoFilename || null
  };

  var promise;
  if (state.editingPersonId) {
    promise = apiPut('/api/people/' + state.editingPersonId, data);
  } else {
    promise = apiPost('/api/people', data);
  }

  // Collect spouse date changes (only visible when editing)
  var spouseDateUpdates = [];
  document.querySelectorAll('#inp-spouse-dates-list input[data-rel-id]').forEach(function(inp) {
    spouseDateUpdates.push({ relId: inp.dataset.relId, field: inp.dataset.field, value: inp.value || null });
  });

  promise.then(function(person) {
    if (person.error) { showError(person.error); return; }
    closeModal('modal-person');
    var wasEditing = state.editingPersonId;
    state.editingPersonId = null;

    // Save spouse date changes
    var relUpdates = {};
    spouseDateUpdates.forEach(function(u) {
      if (!relUpdates[u.relId]) relUpdates[u.relId] = {};
      relUpdates[u.relId][u.field] = u.value;
    });
    var relSavePromises = Object.keys(relUpdates).map(function(relId) {
      return fetch('/api/relationships/' + relId, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, _authHeaders()),
        body: JSON.stringify(relUpdates[relId])
      });
    });

    // If a parent or spouse was selected, create the relationships before refreshing
    var parentId = !wasEditing && document.getElementById('inp-parent').value;
    var spouseId = !wasEditing && document.getElementById('inp-spouse').value;
    var relPromises = [];
    if (parentId && person.id) {
      relPromises.push(apiPost('/api/relationships', {
        person1_id: parentId,
        person2_id: person.id,
        type: 'parent'
      }));
    }
    if (spouseId && person.id) {
      relPromises.push(apiPost('/api/relationships', {
        person1_id: person.id,
        person2_id: spouseId,
        type: 'spouse'
      }));
    }
    var allSavePromises = relPromises.concat(relSavePromises);
    if (allSavePromises.length > 0) {
      Promise.all(allSavePromises).then(function() {
        refreshTree().then(function() { showPersonPanel(person.id || wasEditing); });
      });
    } else {
      refreshTree().then(function() {
        if (wasEditing) {
          showPersonPanel(wasEditing);
        } else if (person.id) {
          showPersonPanel(person.id);
        }
      });
    }
  }).catch(function(err) {
    showError('שגיאה בשמירת האדם: ' + err.message);
  });
}

// ============================================================
// Photo Upload
// ============================================================

function resizeImage(file, maxPx, quality, cb) {
  var img = new Image();
  var url = URL.createObjectURL(file);
  img.onload = function() {
    URL.revokeObjectURL(url);
    var w = img.width, h = img.height;
    if (w > maxPx || h > maxPx) {
      if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
      else        { w = Math.round(w * maxPx / h); h = maxPx; }
    }
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    canvas.toBlob(function(blob) { cb(blob, 'image/jpeg'); }, 'image/jpeg', quality);
  };
  img.onerror = function() { cb(file, file.type); }; // fallback: upload original
  img.src = url;
}

function setupPhotoUpload() {
  var area = document.getElementById('photo-upload-area');
  var fileInput = document.getElementById('photo-file-input');
  var preview = document.getElementById('photo-preview');
  var placeholder = document.getElementById('photo-placeholder');

  area.addEventListener('click', function() {
    fileInput.click();
  });

  fileInput.addEventListener('change', function() {
    var file = fileInput.files[0];
    if (!file) return;

    var cfg = window.APP_CONFIG || {};

    // Resize image client-side before uploading (max 1200px, JPEG 85%)
    resizeImage(file, 1200, 0.85, function(blob, mimeType) {
      if (cfg.usePresignedUpload) {
        apiPost('/api/upload-url', { filename: file.name, contentType: mimeType })
          .then(function(data) {
            if (data.error) { showError(data.error); return; }
            return fetch(data.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': mimeType },
              body: blob
            }).then(function(r) {
              if (!r.ok) throw new Error('Upload failed: ' + r.status);
              state.photoFilename = data.photoUrl;
              preview.src = data.photoUrl;
              preview.classList.remove('hidden');
              placeholder.style.display = 'none';
            });
          })
          .catch(function(err) { showError('העלאה נכשלה: ' + err.message); });
      } else {
        var formData = new FormData();
        formData.append('photo', blob, file.name);
        fetch('/api/upload', { method: 'POST', body: formData })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.error) { showError(data.error); return; }
            state.photoFilename = data.filename;
            preview.src = data.url;
            preview.classList.remove('hidden');
            placeholder.style.display = 'none';
          })
          .catch(function(err) { showError('העלאה נכשלה: ' + err.message); });
      }
    });
  });

  // Drag and drop
  area.addEventListener('dragover', function(e) {
    e.preventDefault();
    area.style.borderColor = '#5b8dee';
  });
  area.addEventListener('dragleave', function() {
    area.style.borderColor = '';
  });
  area.addEventListener('drop', function(e) {
    e.preventDefault();
    area.style.borderColor = '';
    var file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      var dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });
}

// ============================================================
// Relationship Modal
// ============================================================

function populatePersonSelects() {
  var sorted = state.people.slice().sort(function(a, b) {
    var an = ((a.first_name || '') + ' ' + (a.last_name || '')).trim().toLowerCase();
    var bn = ((b.first_name || '') + ' ' + (b.last_name || '')).trim().toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });

  var selects = [
    'rel-parent-select',
    'rel-child-select',
    'rel-spouse1-select',
    'rel-spouse2-select'
  ];

  selects.forEach(function(selId) {
    var sel = document.getElementById(selId);
    var firstOption = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(firstOption);
    sorted.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = personName(p.id);
      sel.appendChild(opt);
    });
  });
}

function openRelModal(preselectedId) {
  populatePersonSelects();
  document.getElementById('rel-type').value = 'parent';
  document.getElementById('rel-parent-fields').classList.remove('hidden');
  document.getElementById('rel-spouse-fields').classList.add('hidden');
  document.getElementById('rel-parent-select').value = preselectedId || '';
  document.getElementById('rel-child-select').value = '';
  document.getElementById('rel-spouse1-select').value = preselectedId || '';
  document.getElementById('rel-spouse2-select').value = '';
  document.getElementById('rel-marriage-date').value = '';
  document.getElementById('rel-separation-date').value = '';
  document.getElementById('rel-notes').value = '';
  openModal('modal-rel');
}

function saveRelModal() {
  var type = document.getElementById('rel-type').value;
  var person1_id, person2_id, start_date, end_date;

  if (type === 'parent') {
    person1_id = document.getElementById('rel-parent-select').value;
    person2_id = document.getElementById('rel-child-select').value;
    if (!person1_id || !person2_id) {
      showError('יש לבחור הורה וילד.');
      return;
    }
    if (person1_id === person2_id) {
      showError('ההורה והילד חייבים להיות אנשים שונים.');
      return;
    }
    start_date = null;
    end_date = null;
  } else {
    person1_id = document.getElementById('rel-spouse1-select').value;
    person2_id = document.getElementById('rel-spouse2-select').value;
    if (!person1_id || !person2_id) {
      showError('יש לבחור שני אנשים.');
      return;
    }
    if (person1_id === person2_id) {
      showError('יש לבחור שני אנשים שונים.');
      return;
    }
    start_date = document.getElementById('rel-marriage-date').value || null;
    end_date = document.getElementById('rel-separation-date').value || null;
  }

  var notes = document.getElementById('rel-notes').value.trim() || null;

  apiPost('/api/relationships', {
    person1_id: person1_id,
    person2_id: person2_id,
    type: type,
    start_date: start_date,
    end_date: end_date,
    notes: notes
  }).then(function(data) {
    if (data.error) { showError(data.error); return; }
    closeModal('modal-rel');
    refreshTree();
  }).catch(function(err) {
    showError('שגיאה בשמירת הקשר: ' + err.message);
  });
}

// ============================================================
// Search with autocomplete
// ============================================================

function setupSearch() {
  var input = document.getElementById('search-input');
  var dropdown = document.getElementById('search-dropdown');
  var activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    activeIdx = -1;
  }

  function selectSearchPerson(person) {
    input.value = '';
    closeDropdown();
    window.highlightSearch('');
    // Open panel and center tree on the person
    refreshTree().then(function() {
      showPersonPanel(person.id);
      if (window.centerOnPerson) window.centerOnPerson(person.id);
    });
  }

  input.addEventListener('input', function() {
    var term = input.value.trim();
    window.highlightSearch(term);
    activeIdx = -1;

    if (!term) { closeDropdown(); return; }

    var termL = term.toLowerCase();
    var matches = state.people.filter(function(p) {
      var full = ((p.first_name || '') + ' ' + (p.last_name || '')).trim().toLowerCase();
      return full.indexOf(termL) !== -1;
    }).slice(0, 8);

    if (matches.length === 0) { closeDropdown(); return; }

    dropdown.innerHTML = '';
    dropdown.classList.remove('hidden');
    matches.forEach(function(p, idx) {
      var li = document.createElement('li');
      li.className = 'search-dropdown-item';
      li.textContent = personName(p.id);
      if (p.is_deceased || p.death_date) li.textContent += ' ז"ל';
      li.addEventListener('mousedown', function(e) {
        e.preventDefault(); // keep focus on input briefly
        selectSearchPerson(p);
      });
      dropdown.appendChild(li);
    });
    activeIdx = -1;
  });

  input.addEventListener('keydown', function(e) {
    var items = dropdown.querySelectorAll('.search-dropdown-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      items.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  input.addEventListener('blur', function() {
    setTimeout(closeDropdown, 150);
  });
}

// ============================================================
// Upcoming Events Widget
// ============================================================

function refreshUpcomingWidget() {
  var list = document.getElementById('upcoming-list');
  if (!list) return;

  var today = new Date();

  function daysUntil(mmdd) {
    var parts = mmdd.split('-');
    var m = parseInt(parts[0], 10) - 1;
    var d = parseInt(parts[1], 10);
    var thisYear = new Date(today.getFullYear(), m, d);
    var diff = Math.round((thisYear - today) / 86400000);
    if (diff < 0) diff += 365;
    return diff;
  }

  function getMMDD(dateStr) {
    if (!dateStr) return null;
    var p = dateStr.split('-');
    if (p.length < 3) return null;
    return p[1] + '-' + p[2];
  }

  var events = [];

  state.people.forEach(function(p) {
    var mmdd = getMMDD(p.birth_date);
    if (mmdd) {
      var days = daysUntil(mmdd);
      if (days <= 30) events.push({ days: days, icon: '🎂', name: personName(p.id), sub: 'יום הולדת', id: p.id });
    }
    if (p.is_deceased || p.death_date) {
      var dmmdd = getMMDD(p.death_date);
      if (dmmdd) {
        var ddays = daysUntil(dmmdd);
        if (ddays <= 30) events.push({ days: ddays, icon: '🕯️', name: personName(p.id), sub: 'יארצייט', id: p.id });
      }
    }
  });

  state.relationships.forEach(function(r) {
    if (r.type !== 'spouse' || !r.start_date) return;
    var mmdd = getMMDD(r.start_date);
    if (!mmdd) return;
    var days = daysUntil(mmdd);
    if (days <= 30) {
      events.push({ days: days, icon: '💍', name: personName(r.person1_id) + ' ו' + personName(r.person2_id), sub: 'יום נישואין', id: r.person1_id });
    }
  });

  events.sort(function(a, b) { return a.days - b.days; });

  list.innerHTML = '';

  if (events.length === 0) {
    var empty = document.createElement('li');
    empty.className = 'upcoming-empty';
    empty.textContent = 'אין אירועים ב-30 הימים הקרובים';
    list.appendChild(empty);
    return;
  }

  events.forEach(function(ev) {
    var li = document.createElement('li');
    li.className = 'upcoming-item';
    var daysLabel = ev.days === 0 ? 'היום!' : ev.days === 1 ? 'מחר' : 'בעוד ' + ev.days + ' ימים';
    li.innerHTML =
      '<span class="upcoming-item-icon">' + ev.icon + '</span>' +
      '<div class="upcoming-item-info">' +
        '<div class="upcoming-item-name">' + ev.name + '</div>' +
        '<div class="upcoming-item-sub">' + ev.sub + '</div>' +
      '</div>' +
      '<span class="upcoming-item-days' + (ev.days === 0 ? ' today' : '') + '">' + daysLabel + '</span>';
    if (ev.id) {
      (function(pid) {
        li.addEventListener('click', function() {
          showPersonPanel(pid);
          if (window.centerOnPerson) window.centerOnPerson(pid);
        });
      })(ev.id);
    }
    list.appendChild(li);
  });
}

// ============================================================
// Event Listeners Setup
// ============================================================

function setupEventListeners() {
  // Add person buttons
  document.getElementById('btn-add-person').addEventListener('click', openAddPersonModal);
  var addFirst = document.getElementById('btn-add-first');
  if (addFirst) addFirst.addEventListener('click', openAddPersonModal);

  // Add relationship button
  document.getElementById('btn-add-rel').addEventListener('click', function() {
    if (state.people.length < 2) {
      showError('נדרשים לפחות 2 אנשים להוספת קשר.');
      return;
    }
    openRelModal();
  });

  // Person modal save
  document.getElementById('btn-save-person').addEventListener('click', savePersonModal);

  // Relationship modal save
  document.getElementById('btn-save-rel').addEventListener('click', saveRelModal);

  // Relationship type toggle — keep preselected person in the active fields
  document.getElementById('rel-type').addEventListener('change', function() {
    var type = this.value;
    document.getElementById('rel-parent-fields').classList.toggle('hidden', type !== 'parent');
    document.getElementById('rel-spouse-fields').classList.toggle('hidden', type !== 'spouse');
    // Mirror preselected value across tabs
    var preId = document.getElementById('rel-parent-select').value || document.getElementById('rel-spouse1-select').value;
    if (preId) {
      document.getElementById('rel-parent-select').value = preId;
      document.getElementById('rel-spouse1-select').value = preId;
    }
  });

  // Modal close buttons (data-modal attribute)
  document.querySelectorAll('.modal-close, [data-modal]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var modalId = btn.getAttribute('data-modal');
      if (modalId) closeModal(modalId);
    });
  });

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });

  // Panel close
  document.getElementById('panel-close').addEventListener('click', closePersonPanel);

  // Keyboard: Escape to close
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      // Close topmost modal
      var modals = document.querySelectorAll('.modal-overlay:not(.hidden)');
      if (modals.length > 0) {
        modals[modals.length - 1].classList.add('hidden');
      } else {
        closePersonPanel();
      }
    }
  });

  // Enter in person modal
  document.getElementById('inp-first-name').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') savePersonModal();
  });
  document.getElementById('inp-last-name').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') savePersonModal();
  });
}

// ============================================================
// Override selectPerson from tree.js
// ============================================================

window.selectPerson = function(id) {
  showPersonPanel(id);
  if (window.centerOnPerson) window.centerOnPerson(id);
};

window.deselectPerson = function() {
  closePersonPanel();
};

// ============================================================
// Init
// ============================================================

// ============================================================
// Password Gate
// ============================================================

function setupPasswordGate() {
  var gate = document.getElementById('password-gate');
  if (!gate) return;

  if (sessionStorage.getItem('ft_auth') === '1') {
    gate.classList.add('hidden');
    return;
  }

  var input = document.getElementById('password-input');
  var errEl = document.getElementById('password-error');
  var btn   = document.getElementById('password-submit');

  function tryPassword() {
    var lastName = input.value.trim();
    if (!lastName) return;
    btn.disabled = true;
    errEl.textContent = '';

    var base = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '';
    fetch(base + '/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastName: lastName })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        if (data.token) {
          sessionStorage.setItem('ft_auth', '1');
          sessionStorage.setItem('ft_token', data.token);
          gate.classList.add('hidden');
          refreshTree();
        } else {
          errEl.textContent = data.error || 'שם משפחה לא נמצא';
          input.classList.add('error');
          input.value = '';
          setTimeout(function() { input.classList.remove('error'); }, 400);
          input.focus();
        }
      })
      .catch(function() {
        btn.disabled = false;
        errEl.textContent = 'שגיאת חיבור, נסה שוב.';
      });
  }

  btn.addEventListener('click', tryPassword);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') tryPassword();
  });
  input.focus();
}

document.addEventListener('DOMContentLoaded', function() {
  setupPasswordGate();
  setupEventListeners();
  setupPhotoUpload();
  setupPanelPhotoUpload();
  setupSearch();

  // Load initial data only if already authenticated
  if (sessionStorage.getItem('ft_auth') === '1') {
    refreshTree();
  }
});
