// ===== tree.js — Layout + SVG Rendering =====
// No ES modules. Global functions only.

var CARD_W = 160;
var CARD_H = 85;
var COUPLE_GAP = 18;
var H_GAP = 55;
var V_GAP = 140;

var SVG_NS = 'http://www.w3.org/2000/svg';
var XLINK_NS = 'http://www.w3.org/1999/xlink';

// Pan/zoom state
var _pan = { x: 60, y: 60 };
var _scale = 1;
var _dragging = false;
var _dragStart = { x: 0, y: 0 };
var _panStart = { x: 0, y: 0 };

// Layout data (populated by renderTree)
var _positions = {};   // id -> {x, y}
var _people = [];
var _relationships = [];

// Override in app.js
window.selectPerson = function(id) {
  console.log('selectPerson', id);
};

// ============================================================
// Helpers
// ============================================================

function _svgEl(tag, attrs) {
  var el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (var k in attrs) {
      if (k === 'href') {
        el.setAttributeNS(null, 'href', attrs[k]);
      } else {
        el.setAttribute(k, attrs[k]);
      }
    }
  }
  return el;
}

function _truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function _yearFrom(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 4);
}

function _cardFill(gender) {
  if (gender === 'M') return '#ebf4ff';
  if (gender === 'F') return '#fff0f6';
  return '#f7fafc';
}

function _cardStroke(gender) {
  if (gender === 'M') return '#90cdf4';
  if (gender === 'F') return '#fbb6ce';
  return '#e2e8f0';
}

function _initialsCircleFill(gender) {
  if (gender === 'M') return '#bee3f8';
  if (gender === 'F') return '#fed7e2';
  return '#e2e8f0';
}

function _personById(id) {
  for (var i = 0; i < _people.length; i++) {
    if (_people[i].id === id) return _people[i];
  }
  return null;
}

// ============================================================
// Build graph structures
// ============================================================

function _buildGraph(people, relationships) {
  var parentsOf = {};
  var childrenOf = {};
  var spousesOf = {};

  people.forEach(function(p) {
    parentsOf[p.id] = [];
    childrenOf[p.id] = [];
    spousesOf[p.id] = [];
  });

  relationships.forEach(function(r) {
    if (r.type === 'parent') {
      // person1 is parent of person2
      if (parentsOf[r.person2_id] !== undefined) parentsOf[r.person2_id].push(r.person1_id);
      if (childrenOf[r.person1_id] !== undefined) childrenOf[r.person1_id].push(r.person2_id);
    } else if (r.type === 'spouse') {
      if (spousesOf[r.person1_id] !== undefined) spousesOf[r.person1_id].push(r.person2_id);
      if (spousesOf[r.person2_id] !== undefined) spousesOf[r.person2_id].push(r.person1_id);
    }
  });

  return { parentsOf: parentsOf, childrenOf: childrenOf, spousesOf: spousesOf };
}

// ============================================================
// Layout Algorithm
// ============================================================

function _computeLayout(people, relationships) {
  if (people.length === 0) return {};

  var graph = _buildGraph(people, relationships);
  var parentsOf = graph.parentsOf;
  var childrenOf = graph.childrenOf;
  var spousesOf = graph.spousesOf;

  var ids = people.map(function(p) { return p.id; });
  var generation = {};
  var visited = {};

  // BFS from roots (no parents). Spouses get same generation.
  var roots = ids.filter(function(id) { return parentsOf[id].length === 0; });

  // Handle disconnected: any unvisited node becomes a root
  function bfsFrom(startIds) {
    var queue = startIds.slice();
    startIds.forEach(function(id) {
      if (generation[id] === undefined) generation[id] = 0;
    });

    while (queue.length > 0) {
      var cur = queue.shift();
      if (visited[cur]) continue;
      visited[cur] = true;
      var gen = generation[cur];

      // Propagate to spouses (same generation)
      spousesOf[cur].forEach(function(sid) {
        if (generation[sid] === undefined) {
          generation[sid] = gen;
          queue.push(sid);
        }
      });

      // Propagate to children (gen + 1)
      childrenOf[cur].forEach(function(cid) {
        var proposed = gen + 1;
        if (generation[cid] === undefined || generation[cid] < proposed) {
          generation[cid] = proposed;
          queue.push(cid);
        }
      });
    }
  }

  if (roots.length > 0) bfsFrom(roots);

  // Handle disconnected subgraphs
  ids.forEach(function(id) {
    if (!visited[id]) {
      generation[id] = 0;
      bfsFrom([id]);
    }
  });

  // Reconcile spouse generations: spouses must be in the same generation (take max)
  var changed = true;
  while (changed) {
    changed = false;
    ids.forEach(function(id) {
      spousesOf[id].forEach(function(sid) {
        var maxG = Math.max(generation[id], generation[sid]);
        if (generation[id] < maxG) { generation[id] = maxG; changed = true; }
        if (generation[sid] < maxG) { generation[sid] = maxG; changed = true; }
      });
    });
  }

  // Re-push children down so they are always at least parent_gen + 1
  changed = true;
  while (changed) {
    changed = false;
    ids.forEach(function(id) {
      childrenOf[id].forEach(function(cid) {
        var minChildGen = generation[id] + 1;
        if (generation[cid] < minChildGen) {
          generation[cid] = minChildGen;
          changed = true;
        }
      });
    });
  }

  // Group people by generation
  var maxGen = 0;
  ids.forEach(function(id) { if (generation[id] > maxGen) maxGen = generation[id]; });

  var byGen = {};
  for (var g = 0; g <= maxGen; g++) byGen[g] = [];
  ids.forEach(function(id) { byGen[generation[id]].push(id); });

  // Within each generation create couples groups
  function buildGroups(genIds) {
    var grouped = {};
    var groups = [];
    genIds.forEach(function(id) {
      if (grouped[id]) return;
      grouped[id] = true;
      var spouseInGen = null;
      for (var i = 0; i < spousesOf[id].length; i++) {
        var sid = spousesOf[id][i];
        if (generation[sid] === generation[id] && !grouped[sid]) {
          spouseInGen = sid;
          break;
        }
      }
      if (spouseInGen !== null) {
        grouped[spouseInGen] = true;
        groups.push([id, spouseInGen]);
      } else {
        groups.push([id]);
      }
    });
    return groups;
  }

  // Sort groups by parent x-position
  function avgParentX(group, pos) {
    var parentXs = [];
    group.forEach(function(id) {
      parentsOf[id].forEach(function(pid) {
        if (pos[pid] !== undefined) {
          parentXs.push(pos[pid].x + CARD_W / 2);
        }
      });
    });
    if (parentXs.length === 0) return Infinity;
    return parentXs.reduce(function(a, b) { return a + b; }, 0) / parentXs.length;
  }

  var positions = {};

  // Process generation by generation
  for (var gen = 0; gen <= maxGen; gen++) {
    var genIds = byGen[gen];
    var groups = buildGroups(genIds);

    // Sort: groups with parents first (by avg parent x), then orphans
    groups.sort(function(a, b) {
      var ax = avgParentX(a, positions);
      var bx = avgParentX(b, positions);
      return ax - bx;
    });

    var curX = 40;
    var y = gen * (CARD_H + V_GAP) + 40;

    groups.forEach(function(group) {
      var groupWidth = group.length === 2 ? (2 * CARD_W + COUPLE_GAP) : CARD_W;
      // Try to center this group under its parents; fall back to curX if no space
      var parentAvgX = avgParentX(group, positions);
      var idealLeft = parentAvgX !== Infinity ? Math.round(parentAvgX - groupWidth / 2) : curX;
      var startX = Math.max(curX, idealLeft);

      if (group.length === 2) {
        positions[group[0]] = { x: startX, y: y };
        positions[group[1]] = { x: startX + CARD_W + COUPLE_GAP, y: y };
        curX = startX + 2 * CARD_W + COUPLE_GAP + H_GAP;
      } else {
        positions[group[0]] = { x: startX, y: y };
        curX = startX + CARD_W + H_GAP;
      }
    });
  }

  return positions;
}

// ============================================================
// Draw Edges
// ============================================================

function _drawEdges(root, positions, people, relationships) {
  var graph = _buildGraph(people, relationships);
  var parentsOf = graph.parentsOf;
  var childrenOf = graph.childrenOf;
  var spousesOf = graph.spousesOf;

  var edgeGroup = _svgEl('g', { class: 'edges' });

  // Draw SPOUSE lines
  relationships.forEach(function(r) {
    if (r.type !== 'spouse') return;
    var p1 = positions[r.person1_id];
    var p2 = positions[r.person2_id];
    if (!p1 || !p2) return;

    // Determine left/right
    var leftPos = p1.x <= p2.x ? p1 : p2;
    var rightPos = p1.x <= p2.x ? p2 : p1;

    var x1 = leftPos.x + CARD_W;
    var x2 = rightPos.x;
    var y = leftPos.y + CARD_H / 2;

    var line = _svgEl('line', {
      x1: x1, y1: y, x2: x2, y2: y,
      stroke: '#fbb6ce',
      'stroke-width': 2,
      'stroke-dasharray': '5,3'
    });
    edgeGroup.appendChild(line);

    // Heart symbol at midpoint
    var mx = (x1 + x2) / 2;
    var heart = _svgEl('text', {
      x: mx, y: y - 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'auto',
      'font-size': '13',
      style: 'user-select:none;pointer-events:none'
    });
    heart.textContent = '❤';
    edgeGroup.appendChild(heart);

    // Marriage year
    if (r.start_date) {
      var year = _yearFrom(r.start_date);
      var yearText = _svgEl('text', {
        x: mx, y: y + 13,
        'text-anchor': 'middle',
        'dominant-baseline': 'auto',
        'font-size': '10',
        fill: '#b794f4',
        style: 'user-select:none;pointer-events:none'
      });
      yearText.textContent = year;
      edgeGroup.appendChild(yearText);
    }
  });

  // Draw PARENT-CHILD edges
  // Find all unique "couple or single parent" units that have children
  var processedParentUnits = {};

  people.forEach(function(p) {
    var id = p.id;
    if (!positions[id]) return;
    var children = childrenOf[id];
    if (children.length === 0) return;

    // Find spouse in same generation
    var spouse = null;
    for (var i = 0; i < spousesOf[id].length; i++) {
      var sid = spousesOf[id][i];
      if (positions[sid]) {
        // Check if spouse also shares children
        var sharedChildren = children.filter(function(cid) {
          return parentsOf[cid].indexOf(sid) !== -1;
        });
        if (sharedChildren.length > 0) {
          spouse = sid;
          break;
        }
      }
    }

    // Create a unit key to avoid double-drawing
    var unitKey = spouse ? [Math.min(id, spouse), Math.max(id, spouse)].join('-') : String(id);
    if (processedParentUnits[unitKey]) return;
    processedParentUnits[unitKey] = true;

    // Determine which children belong to this unit
    var unitChildren = children.filter(function(cid) {
      if (!positions[cid]) return false;
      if (spouse) {
        return parentsOf[cid].indexOf(spouse) !== -1;
      }
      return true;
    });

    if (unitChildren.length === 0) {
      // Draw edges just from this parent to all their children
      unitChildren = children.filter(function(cid) { return positions[cid]; });
      if (unitChildren.length === 0) return;
    }

    var pos = positions[id];
    var anchorX;
    var parentBottom = pos.y + CARD_H;

    if (spouse && positions[spouse]) {
      var leftX = Math.min(pos.x, positions[spouse].x);
      var rightX = Math.max(pos.x, positions[spouse].x) + CARD_W;
      anchorX = (leftX + rightX) / 2;
    } else {
      anchorX = pos.x + CARD_W / 2;
    }

    // Smooth bezier curve from parent anchor to each child's top-center.
    // Control points sit at the vertical midpoint, horizontally aligned with
    // each endpoint — creates a clear S-curve per connection with no shared bars.
    unitChildren.forEach(function(cid) {
      var cpos = positions[cid];
      var cCenterX = cpos.x + CARD_W / 2;
      var childTop = cpos.y;
      var midY = Math.round((parentBottom + childTop) / 2);

      var path = _svgEl('path', {
        d: 'M ' + anchorX + ',' + parentBottom +
           ' C ' + anchorX + ',' + midY +
           ' ' + cCenterX + ',' + midY +
           ' ' + cCenterX + ',' + childTop,
        stroke: '#5b8dee',
        'stroke-width': 2,
        fill: 'none'
      });
      edgeGroup.appendChild(path);
    });
  });

  root.appendChild(edgeGroup);
}

// ============================================================
// Draw Person Cards
// ============================================================

function _drawCards(root, positions, people) {
  var cardGroup = _svgEl('g', { class: 'cards' });

  // Create clipPath defs in SVG
  var svg = document.getElementById('tree-svg');
  var defs = svg.querySelector('defs');
  if (!defs) {
    defs = _svgEl('defs', {});
    svg.insertBefore(defs, svg.firstChild);
  }
  // Clear old clip paths
  var oldClips = defs.querySelectorAll('.photo-clip');
  oldClips.forEach(function(el) { el.remove(); });

  people.forEach(function(person) {
    var pos = positions[person.id];
    if (!pos) return;

    var x = pos.x;
    var y = pos.y;
    var id = person.id;

    var g = _svgEl('g', {
      class: 'person-node',
      'data-id': id,
      style: 'cursor:pointer'
    });

    // Outer card rect
    var fillColor = _cardFill(person.gender);
    var strokeColor = _cardStroke(person.gender);
    var fillOpacity = person.death_date ? 0.75 : 1;

    var rect = _svgEl('rect', {
      class: 'card-rect',
      x: x, y: y,
      width: CARD_W,
      height: CARD_H,
      rx: 10, ry: 10,
      fill: fillColor,
      'fill-opacity': fillOpacity,
      stroke: strokeColor,
      'stroke-width': 1.5,
      filter: 'url(#card-shadow)'
    });
    g.appendChild(rect);

    // Photo circle
    var cx = x + 32;
    var cy = y + CARD_H / 2;
    var r = 26;

    if (person.photo) {
      // ClipPath for circular photo
      var clipId = 'clip-' + id;
      var clipPath = _svgEl('clipPath', { id: clipId, class: 'photo-clip' });
      var clipCircle = _svgEl('circle', { cx: cx, cy: cy, r: r });
      clipPath.appendChild(clipCircle);
      defs.appendChild(clipPath);

      var img = _svgEl('image', {
        href: '/uploads/' + person.photo,
        x: cx - r, y: cy - r,
        width: r * 2, height: r * 2,
        'clip-path': 'url(#' + clipId + ')',
        preserveAspectRatio: 'xMidYMid slice'
      });
      g.appendChild(img);

      // Circle border over photo
      var photoBorder = _svgEl('circle', {
        cx: cx, cy: cy, r: r,
        fill: 'none',
        stroke: strokeColor,
        'stroke-width': 1.5
      });
      g.appendChild(photoBorder);
    } else {
      // Small colored circle — gender indicator only, no initials
      var circleBg = _svgEl('circle', {
        cx: x + 14, cy: y + 14, r: 7,
        fill: _initialsCircleFill(person.gender),
        stroke: strokeColor,
        'stroke-width': 1.5
      });
      g.appendChild(circleBg);
    }

    // Deceased indicator: show ז"ל in top-right corner
    if (person.is_deceased || person.death_date) {
      var zlText = _svgEl('text', {
        x: x + CARD_W - 6, y: y + 14,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-size': '10',
        'font-weight': '600',
        fill: '#718096',
        style: 'user-select:none;pointer-events:none'
      });
      zlText.textContent = 'ז"ל';
      g.appendChild(zlText);
    }

    // Name text — centered in card
    var firstName = person.first_name || '';
    var lastName = person.last_name || '';
    var fullName = (firstName + ' ' + lastName).trim();
    var textX = person.photo ? x + 68 : x + CARD_W / 2;
    var textAnchor = person.photo ? 'start' : 'middle';

    var nameText = _svgEl('text', {
      x: textX, y: y + (person.photo ? 30 : 34),
      'font-size': '13',
      'font-weight': '600',
      'text-anchor': textAnchor,
      fill: '#2d3748',
      style: 'user-select:none;pointer-events:none'
    });
    nameText.textContent = _truncate(fullName, person.photo ? 12 : 17);
    g.appendChild(nameText);

    // Birth-death text
    var birthYear = _yearFrom(person.birth_date);
    var deathYear = _yearFrom(person.death_date);
    var dateStr = '';
    if (birthYear && deathYear) {
      dateStr = birthYear + ' – ' + deathYear;
    } else if (birthYear) {
      dateStr = 'נ\' ' + birthYear;
    } else if (deathYear) {
      dateStr = 'נפ\' ' + deathYear;
    }

    if (dateStr) {
      var dateText = _svgEl('text', {
        x: textX, y: y + (person.photo ? 47 : 52),
        'font-size': '11',
        'text-anchor': textAnchor,
        fill: '#718096',
        style: 'user-select:none;pointer-events:none'
      });
      dateText.textContent = dateStr;
      g.appendChild(dateText);
    }

    // Notes preview
    if (person.notes) {
      var notesText = _svgEl('text', {
        x: textX, y: y + (person.photo ? 63 : 68),
        'font-size': '10',
        'text-anchor': textAnchor,
        fill: '#a0aec0',
        style: 'user-select:none;pointer-events:none'
      });
      notesText.textContent = _truncate(person.notes, 22);
      g.appendChild(notesText);
    }

    // Hover effects
    g.addEventListener('mouseenter', function() {
      rect.setAttribute('stroke-width', '2.5');
      rect.setAttribute('stroke', '#5b8dee');
    });
    g.addEventListener('mouseleave', function() {
      // Restore only if not selected
      if (!g.classList.contains('selected')) {
        rect.setAttribute('stroke-width', '1.5');
        rect.setAttribute('stroke', strokeColor);
      }
    });

    // Click handler
    g.addEventListener('click', function(e) {
      e.stopPropagation();
      window.selectPerson(id);
    });

    cardGroup.appendChild(g);
  });

  root.appendChild(cardGroup);
}

// ============================================================
// Main renderTree
// ============================================================

var _firstRender = true;

window.renderTree = function(people, relationships) {
  _people = people || [];
  _relationships = relationships || [];

  var root = document.getElementById('tree-root');
  root.innerHTML = '';

  var emptyState = document.getElementById('empty-state');
  if (_people.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  _positions = _computeLayout(_people, _relationships);

  _drawEdges(root, _positions, _people, _relationships);
  _drawCards(root, _positions, _people, _relationships);

  // Center tree in viewport on first render
  if (_firstRender) {
    _firstRender = false;
    _centerTree();
  }

  _applyTransform();
};

// ============================================================
// Pan & Zoom
// ============================================================

window.centerOnPerson = function(personId) {
  var pos = _positions[personId];
  if (!pos) return;
  var svg = document.getElementById('tree-svg');
  var svgW = svg.clientWidth || window.innerWidth;
  var svgH = (svg.clientHeight || window.innerHeight) - 60;
  _pan.x = svgW / 2 - (pos.x + CARD_W / 2) * _scale;
  _pan.y = svgH / 2 - (pos.y + CARD_H / 2) * _scale;
  _applyTransform();
};

function _centerTree() {
  if (Object.keys(_positions).length === 0) return;
  var svg = document.getElementById('tree-svg');
  var svgW = svg.clientWidth || window.innerWidth;
  var svgH = (svg.clientHeight || window.innerHeight) - 60; // minus topbar

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var pid in _positions) {
    var pos = _positions[pid];
    if (pos.x < minX) minX = pos.x;
    if (pos.x + CARD_W > maxX) maxX = pos.x + CARD_W;
    if (pos.y < minY) minY = pos.y;
    if (pos.y + CARD_H > maxY) maxY = pos.y + CARD_H;
  }

  var treeW = maxX - minX;
  var treeH = maxY - minY;

  // Fit scale so tree fills ~80% of viewport
  var fitScale = Math.min(
    (svgW * 0.9) / treeW,
    (svgH * 0.9) / treeH,
    1.0
  );
  _scale = Math.max(0.15, fitScale);

  // Center in viewport
  _pan.x = (svgW - treeW * _scale) / 2 - minX * _scale;
  _pan.y = (svgH - treeH * _scale) / 2 - minY * _scale;
}

function _applyTransform() {
  var root = document.getElementById('tree-root');
  if (root) {
    root.setAttribute('transform', 'translate(' + _pan.x + ',' + _pan.y + ') scale(' + _scale + ')');
  }
}

function _onWheel(e) {
  e.preventDefault();
  var factor = Math.pow(0.999, e.deltaY);
  _scale = Math.min(3, Math.max(0.15, _scale * factor));
  _applyTransform();
}

function _onMouseDown(e) {
  if (e.target.closest('.person-node')) return;
  _dragging = true;
  _dragStart = { x: e.clientX, y: e.clientY };
  _panStart = { x: _pan.x, y: _pan.y };
}

function _onMouseMove(e) {
  if (!_dragging) return;
  _pan.x = _panStart.x + (e.clientX - _dragStart.x);
  _pan.y = _panStart.y + (e.clientY - _dragStart.y);
  _applyTransform();
}

function _onMouseUp() {
  _dragging = false;
}

// Touch support
var _touchStart = null;
var _touchPanStart = null;
var _pinchStartDist = null;
var _pinchStartScale = null;

function _getTouchDist(touches) {
  var dx = touches[0].clientX - touches[1].clientX;
  var dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _onTouchStart(e) {
  if (e.touches.length === 1) {
    _touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    _touchPanStart = { x: _pan.x, y: _pan.y };
  } else if (e.touches.length === 2) {
    _pinchStartDist = _getTouchDist(e.touches);
    _pinchStartScale = _scale;
  }
}

function _onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && _touchStart) {
    _pan.x = _touchPanStart.x + (e.touches[0].clientX - _touchStart.x);
    _pan.y = _touchPanStart.y + (e.touches[0].clientY - _touchStart.y);
    _applyTransform();
  } else if (e.touches.length === 2 && _pinchStartDist !== null) {
    var dist = _getTouchDist(e.touches);
    _scale = Math.min(3, Math.max(0.15, _pinchStartScale * (dist / _pinchStartDist)));
    _applyTransform();
  }
}

function _onTouchEnd() {
  _touchStart = null;
  _pinchStartDist = null;
}

// ============================================================
// Highlight search matches
// ============================================================

window.highlightSearch = function(term) {
  var nodes = document.querySelectorAll('.person-node');
  nodes.forEach(function(node) {
    node.classList.remove('highlighted');
  });
  if (!term) return;
  term = term.toLowerCase();
  _people.forEach(function(p) {
    var fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
    if (fullName.indexOf(term) !== -1) {
      var node = document.querySelector('.person-node[data-id="' + p.id + '"]');
      if (node) node.classList.add('highlighted');
    }
  });
};

// ============================================================
// Mark selected person
// ============================================================

window.markSelectedPerson = function(id) {
  var nodes = document.querySelectorAll('.person-node');
  nodes.forEach(function(node) {
    node.classList.remove('selected');
    // Reset card rect
    var rect = node.querySelector('.card-rect');
    if (rect && node.dataset.id != id) {
      var pid = parseInt(node.dataset.id);
      var person = _personById(pid);
      if (person) {
        rect.setAttribute('stroke', _cardStroke(person.gender));
        rect.setAttribute('stroke-width', '1.5');
      }
    }
  });
  if (id) {
    var sel = document.querySelector('.person-node[data-id="' + id + '"]');
    if (sel) {
      sel.classList.add('selected');
      var selRect = sel.querySelector('.card-rect');
      if (selRect) {
        selRect.setAttribute('stroke', '#5b8dee');
        selRect.setAttribute('stroke-width', '2.5');
      }
    }
  }
};

// ============================================================
// Init
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  var svg = document.getElementById('tree-svg');
  if (!svg) return;

  svg.addEventListener('wheel', _onWheel, { passive: false });
  svg.addEventListener('mousedown', _onMouseDown);
  window.addEventListener('mousemove', _onMouseMove);
  window.addEventListener('mouseup', _onMouseUp);

  svg.addEventListener('touchstart', _onTouchStart, { passive: true });
  svg.addEventListener('touchmove', _onTouchMove, { passive: false });
  svg.addEventListener('touchend', _onTouchEnd, { passive: true });

  // Zoom control buttons
  var zoomIn = document.getElementById('zoom-in');
  var zoomOut = document.getElementById('zoom-out');
  var zoomReset = document.getElementById('zoom-reset');

  if (zoomIn) zoomIn.addEventListener('click', function() {
    _scale = Math.min(3, _scale * 1.2);
    _applyTransform();
  });
  if (zoomOut) zoomOut.addEventListener('click', function() {
    _scale = Math.max(0.15, _scale / 1.2);
    _applyTransform();
  });
  if (zoomReset) zoomReset.addEventListener('click', function() {
    _centerTree();
    _applyTransform();
  });

  // Click on SVG background → deselect
  svg.addEventListener('click', function(e) {
    if (!e.target.closest('.person-node')) {
      if (window.deselectPerson) window.deselectPerson();
    }
  });
});
