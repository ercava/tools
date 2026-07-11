(function(){
'use strict';
var allData=[],fuse=null,showSiswa=false,isSearching=false;
var BULAN={januari:0,februari:1,maret:2,april:3,mei:4,juni:5,juli:6,agustus:7,september:8,oktober:9,november:10,desember:11};
var searchInput=document.getElementById('search-input');
var searchClear=document.getElementById('search-clear');
var dropdown=document.getElementById('results-dropdown');
var listContainer=document.getElementById('results-list');
var noResults=document.getElementById('no-results');
var modeToggleLink=document.getElementById('mode-toggle-link');
var modeToggleContainer=document.querySelector('.mode-toggle-container');
var birthdayTracker=document.getElementById('birthday-tracker');
var _escDiv=document.createElement('div');

function esc(s){if(!s)return '';_escDiv.textContent=s;return _escDiv.innerHTML;}

function init(){
    try{
        if(typeof window.__SEARCH_DATA==='string'){
            var d=atob(window.__SEARCH_DATA),b=new Uint8Array(d.length);
            for(var i=0;i<d.length;i++)b[i]=d.charCodeAt(i);
            allData=JSON.parse(new TextDecoder('utf-8').decode(b));
        }
    }catch(e){}
    fuse=new Fuse(allData,{keys:[{name:'title',weight:.7},{name:'category',weight:.15},{name:'meta',weight:.15}],threshold:.4,distance:100});
    setupEvents();
    updateBirthday();
}

var CAT_CLASS={'Dokumentasi':'category-dokumentasi','Sertifikat':'category-sertifikat','Kontak':'category-kontak','Siswa A29':'category-siswa-a29'};
var LINK_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

function search(q){
    if(q.length<1){dropdown.style.display='none';return;}
    var r=fuse.search(q),cat=showSiswa?'Siswa A29':null,out=[],i=0,len=r.length;
    for(;i<len&&out.length<20;i++){
        var c=r[i].item.category;
        if(showSiswa){if(c==='Siswa A29')out.push(r[i]);}
        else{if(c!=='Siswa A29')out.push(r[i]);}
    }
    render(out);
}

function render(results){
    if(results.length===0){listContainer.innerHTML='';noResults.style.display='block';dropdown.style.display='block';return;}
    noResults.style.display='none';
    var frag=document.createDocumentFragment();
    for(var i=0;i<results.length;i++){
        var item=results[i].item,row=document.createElement('div');
        row.className='result-item';
        var links='';
        for(var j=0;j<item.links.length;j++){
            var l=item.links[j];
            links+='<a href="'+esc(l.url)+'" target="_blank" class="result-btn" rel="noopener noreferrer">'+LINK_SVG+esc(l.label)+'</a>';
        }
        row.innerHTML='<div class="result-header"><span class="result-title">'+esc(item.title)+'</span><span class="result-category '+(CAT_CLASS[item.category]||'category-link')+'">'+esc(item.category)+'</span></div><div class="result-meta">'+esc(item.meta||'')+'</div><div class="result-links-container">'+links+'</div>';
        frag.appendChild(row);
    }
    listContainer.innerHTML='';
    listContainer.appendChild(frag);
    dropdown.style.display='block';
}

function setupEvents(){
    var debounceTimer;
    searchInput.addEventListener('input',function(){
        var q=this.value.trim();
        searchClear.style.display=q.length>0?'flex':'none';
        isSearching=q.length>0;
        modeToggleContainer.style.display=isSearching?'none':'block';
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(function(){search(q);},80);
    });
    searchClear.addEventListener('click',function(){
        searchInput.value='';searchClear.style.display='none';isSearching=false;
        modeToggleContainer.style.display='block';dropdown.style.display='none';searchInput.focus();
    });
    document.addEventListener('click',function(e){
        if(!searchInput.contains(e.target)&&!dropdown.contains(e.target)&&!modeToggleContainer.contains(e.target))dropdown.style.display='none';
    });
    searchInput.addEventListener('focus',function(){var q=this.value.trim();if(q.length>0)search(q);});
    modeToggleLink.addEventListener('click',function(e){
        e.preventDefault();showSiswa=!showSiswa;
        if(showSiswa){modeToggleLink.textContent='Mode Non-ERC';modeToggleLink.classList.add('active-mode');searchInput.placeholder='Cari data ercavian...';}
        else{modeToggleLink.textContent='Mode ERC Only!';modeToggleLink.classList.remove('active-mode');searchInput.placeholder='Cari dokumentasi, link penting, sertifikat...';}
        updateBirthday();
        var q=searchInput.value.trim();if(q.length>0)search(q);
    });
}

function parseBday(s){
    if(!s)return null;
    var p=s.trim().split(/\s+/);if(p.length<3)return null;
    var d=parseInt(p[0],10),m=BULAN[p[1].toLowerCase()],y=parseInt(p[2],10);
    if(isNaN(d)||m===undefined||isNaN(y))return null;
    return{d:d,m:m,y:y};
}

function updateBirthday(){
    if(!birthdayTracker)return;
    if(!showSiswa){birthdayTracker.style.display='none';return;}
    var now=new Date(),tm=now.getMonth(),td=now.getDate(),ty=now.getFullYear();
    var todayList=[],nextItem=null,nextDays=Infinity;
    for(var i=0;i<allData.length;i++){
        var it=allData[i];if(it.category!=='Siswa A29'||!it.birthday)continue;
        var b=parseBday(it.birthday);if(!b)continue;
        if(b.m===tm&&b.d===td){todayList.push(it);continue;}
        var bd=new Date(ty,b.m,b.d),diff;
        if(bd.getTime()>now.getTime())diff=Math.ceil((bd-now)/864e5);
        else diff=Math.ceil((new Date(ty+1,b.m,b.d)-now)/864e5);
        if(diff>0&&diff<nextDays){nextDays=diff;nextItem=it;}
    }
    var h='';
    if(todayList.length>0){
        h+='<div class="birthday-section birthday-today"><div class="birthday-section-title">Birthday Hari Ini</div>';
        for(var j=0;j<todayList.length;j++)h+='<div class="birthday-person"><span class="birthday-name">'+esc(todayList[j].title)+'</span><span class="birthday-date">'+esc(todayList[j].birthday)+'</span></div>';
        h+='</div>';
    }else{h+='<div class="birthday-section birthday-none"><div class="birthday-section-title">tidak ada ulang tahun hari ini</div></div>';}
    if(nextItem)h+='<div class="birthday-section birthday-next"><div class="birthday-section-title">Birthday Terdekat!</div><div class="birthday-person"><span class="birthday-name">'+esc(nextItem.title)+'</span><span class="birthday-date">'+esc(nextItem.birthday)+' · '+nextDays+' hari lagi</span></div></div>';
    birthdayTracker.innerHTML=h;birthdayTracker.style.display='block';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
