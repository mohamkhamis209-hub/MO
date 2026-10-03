/**
 * منصة تانية بكالوريا — Google Apps Script backend
 * Exams + Results + Books + Videos + Students + protected student sessions.
 */
const ADMIN_TOKEN_PROPERTY = 'ADMIN_TOKEN';
const ADMIN_SESSION_TTL = 30 * 60 * 1000;
const STUDENT_SESSION_TTL = 12 * 60 * 60 * 1000;
const SHEETS = {
  EXAMS: 'Exams', QUESTIONS: 'Questions', ATTEMPTS: 'Attempts',
  BOOKS: 'Books', VIDEOS: 'Videos', STUDENTS: 'Students'
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.EXAMS, ['id','title','subject','duration','attemptLimit','showScore','createdAt','updatedAt','active']);
  ensureSheet_(ss, SHEETS.QUESTIONS, ['examId','qIndex','text','opt1','opt2','opt3','opt4','correct']);
  ensureAttemptsSchema_(ss);
  ensureSheet_(ss, SHEETS.BOOKS, ['id','subject','title','url','createdAt','active']);
  ensureSheet_(ss, SHEETS.VIDEOS, ['id','subject','title','url','createdAt','active']);
  ensureSheet_(ss, SHEETS.STUDENTS, ['id','name','code','createdAt','updatedAt','active','phone']);
  if (!PropertiesService.getScriptProperties().getProperty(ADMIN_TOKEN_PROPERTY)) {
    PropertiesService.getScriptProperties().setProperty(ADMIN_TOKEN_PROPERTY, 'CHANGE_THIS_ADMIN_TOKEN');
  }
  return {ok:true};
}

function doGet() { return json_({ok:true,service:'Thaneya Baccalaurea Exam API',message:'API is running'}); }

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    switch (action) {
      case 'adminLogin': return json_(adminLogin_(body.password));
      case 'studentLogin': return json_(studentLogin_(body.name, body.code));
      case 'listExams': requireStudent_(body); return json_({ok:true,exams:listPublicExams_()});
      case 'listBooks': requireStudent_(body); return json_({ok:true,books:listBooks_()});
      case 'listVideos': requireStudent_(body); return json_({ok:true,videos:listVideos_()});
      case 'submitAttempt': return json_(submitAttempt_(body));
      case 'getStudentResults': return json_(getStudentResults_(body));
      case 'getAdminData': requireAdmin_(body); return json_({ok:true,exams:listAdminExams_(),books:listBooks_(),videos:listVideos_(),students:listStudents_(),results:listResults_('')});
      case 'getResults': requireAdmin_(body); return json_({ok:true,results:listResults_(body.examId || '')});
      case 'createExam': requireAdmin_(body); return json_(createExam_(body.exam));
      case 'updateExam': requireAdmin_(body); return json_(updateExam_(body.exam));
      case 'deleteExam': requireAdmin_(body); return json_(deleteExam_(body.examId));
      case 'clearExams': requireAdmin_(body); return json_(clearExams_());
      case 'clearResults': requireAdmin_(body); return json_(clearResults_());
      case 'createBook': requireAdmin_(body); return json_(createBook_(body.book));
      case 'deleteBook': requireAdmin_(body); return json_(deleteBook_(body.bookId));
      case 'clearBooks': requireAdmin_(body); return json_(clearSheetData_(SHEETS.BOOKS));
      case 'createVideo': requireAdmin_(body); return json_(createVideo_(body.video));
      case 'deleteVideo': requireAdmin_(body); return json_(deleteVideo_(body.videoId));
      case 'clearVideos': requireAdmin_(body); return json_(clearSheetData_(SHEETS.VIDEOS));
      case 'createStudent': requireAdmin_(body); return json_(createStudent_(body.student));
      case 'updateStudentCode': requireAdmin_(body); return json_(updateStudentCode_(body.studentId, body.code));
      case 'deleteStudent': requireAdmin_(body); return json_(deleteStudent_(body.studentId));
      case 'clearStudents': requireAdmin_(body); return json_(clearSheetData_(SHEETS.STUDENTS));
      default: return json_({ok:false,error:'أمر غير معروف'});
    }
  } catch (err) { return json_({ok:false,error:String(err.message || err)}); }
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function adminLogin_(password) {
  const expected = PropertiesService.getScriptProperties().getProperty(ADMIN_TOKEN_PROPERTY);
  if (!expected || String(password || '') !== String(expected)) throw new Error('كلمة مرور الإدارة غير صحيحة');
  const token = newToken_(), expires = Date.now() + ADMIN_SESSION_TTL;
  CacheService.getScriptCache().put('admin_session_' + token, String(expires), 1800);
  return {ok:true,session:token,expiresAt:expires};
}
function requireAdmin_(body) {
  const token = String(body.adminSession || '');
  if (!token) throw new Error('جلسة الإدارة منتهية، سجل الدخول مرة أخرى');
  const raw = CacheService.getScriptCache().get('admin_session_' + token);
  if (!raw || Number(raw) < Date.now()) throw new Error('جلسة الإدارة منتهية، سجل الدخول مرة أخرى');
}
function studentLogin_(identifier, code) {
  const key = String(identifier || '').trim().replace(/\s+/g,' ');
  const cleanCode = normalizeCode_(code);
  if (!key) throw new Error('اكتب اسم الطالب أو رقم الهاتف');
  if (!cleanCode) throw new Error('اكتب كود الطالب');
  const phone = normalizePhone_(key);
  const isPhone = /^01\d{9}$/.test(phone);
  const cleanName = normalizeName_(key);
  if (!isPhone && cleanName.split(' ').filter(Boolean).length !== 3) throw new Error('اكتب اسمًا ثلاثيًا أو رقم هاتف مصري صحيحًا.');
  const rows = rows_(SHEETS.STUDENTS);
  const row = rows.find(r => {
    if (!r[0] || String(r[5]).toLowerCase() === 'false') return false;
    if (normalizeCode_(r[2]) !== cleanCode) return false;
    const rowPhone = normalizePhone_(r[6] || '');
    return isPhone ? rowPhone === phone : normalizeName_(r[1]) === cleanName;
  });
  if (!row) throw new Error('البيانات غير صحيحة. تأكد من الاسم/الهاتف والكود أو اطلب كودًا من المشرف.');
  const token = newToken_(), expires = Date.now() + STUDENT_SESSION_TTL;
  const displayName = String(row[1] || '').trim() || ('طالب ' + String(row[6] || ''));
  CacheService.getScriptCache().put('student_session_' + token, JSON.stringify({expiresAt:expires,studentId:String(row[0]),name:displayName}), 21600);
  return {ok:true,session:token,expiresAt:expires,studentId:String(row[0]),name:displayName};
}
function requireStudent_(body) {
  const token = String(body.studentSession || '');
  if (!token) throw new Error('يجب تسجيل الدخول باسم الطالب والكود أولًا.');
  const raw = CacheService.getScriptCache().get('student_session_' + token);
  if (!raw) throw new Error('جلسة الطالب منتهية، سجل الدخول مرة أخرى.');
  const data = safeJson_(raw, null);
  if (!data || Number(data.expiresAt) < Date.now()) throw new Error('جلسة الطالب منتهية، سجل الدخول مرة أخرى.');
  return data;
}
function newToken_() { return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''); }
function normalizeName_(v) { return String(v || '').trim().replace(/\s+/g,' '); }
function normalizeCode_(v) { return String(v || '').trim().replace(/\s+/g,''); }
function normalizePhone_(v) { let x=String(v||'').trim().replace(/[\s\-()]/g,''); if(/^\+20/.test(x)) x='0'+x.slice(3); if(/^20/.test(x)) x='0'+x.slice(2); return x; }
function validateTripleName_(name) { if (name.split(' ').filter(Boolean).length !== 3) throw new Error('اسم الطالب يجب أن يكون ثلاثيًا بالضبط.'); }
function validateCode_(code) { if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) throw new Error('الكود يجب أن يكون من 4 إلى 32 حرفًا أو رقمًا، بدون مسافات.'); }

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  else if (sh.getLastColumn() < headers.length) sh.getRange(1,1,1,headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}
function ensureAttemptsSchema_(ss) {
  let sh = ss.getSheetByName(SHEETS.ATTEMPTS);
  if (!sh) { sh=ss.insertSheet(SHEETS.ATTEMPTS); sh.getRange(1,1,1,9).setValues([['attemptId','examId','studentId','name','answersJson','score','total','at','durationSeconds']]); sh.setFrozenRows(1); return; }
  const headers=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),9)).getValues()[0].map(String);
  if (headers[2] === 'name' && headers[3] === 'answersJson') { sh.insertColumnBefore(3); sh.getRange(1,3).setValue('studentId'); }
  const wanted=['attemptId','examId','studentId','name','answersJson','score','total','at','durationSeconds'];
  sh.getRange(1,1,1,wanted.length).setValues([wanted]); sh.setFrozenRows(1);
}
function getSheet_(name) { const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if(!sh) throw new Error('جدول '+name+' غير موجود. شغّل setup أولًا'); return sh; }
function rows_(name) { const sh=getSheet_(name), values=sh.getDataRange().getValues(); return values.length>1 ? values.slice(1) : []; }

function listPublicExams_() {
  const exams=rows_(SHEETS.EXAMS), qs=rows_(SHEETS.QUESTIONS);
  return exams.filter(r=>r[0] && String(r[8]).toLowerCase()!=='false').map(r=>({id:String(r[0]),title:String(r[1]),subject:String(r[2]),duration:Number(r[3])||0,attemptLimit:Number(r[4])||0,showScore:String(r[5]).toLowerCase()==='true',questions:qs.filter(q=>String(q[0])===String(r[0])).sort((a,b)=>Number(a[1])-Number(b[1])).map(q=>({text:String(q[2]),options:[String(q[3]),String(q[4]),String(q[5]),String(q[6])] }))})).filter(x=>x.questions.length);
}
function listAdminExams_() {
  const exams=rows_(SHEETS.EXAMS),qs=rows_(SHEETS.QUESTIONS),attempts=rows_(SHEETS.ATTEMPTS);
  return exams.filter(r=>r[0]).map(r=>{const id=String(r[0]);const questions=qs.filter(q=>String(q[0])===id).sort((a,b)=>Number(a[1])-Number(b[1])).map(q=>({text:String(q[2]),options:[String(q[3]),String(q[4]),String(q[5]),String(q[6])],correct:Number(q[7])||0}));return {id,title:String(r[1]),subject:String(r[2]),duration:Number(r[3])||0,attemptLimit:Number(r[4])||0,showScore:String(r[5]).toLowerCase()==='true',createdAt:r[6],updatedAt:r[7],active:String(r[8]).toLowerCase()!=='false',questions,attempts:attempts.filter(a=>String(a[1])===id).map(a=>({attemptId:String(a[0]),examId:id,studentId:String(a[2]||''),name:String(a[3]),answers:safeJson_(a[4],[]),score:Number(a[5])||0,total:Number(a[6])||0,at:a[7],durationSeconds:Number(a[8])||0,examTitle:String(r[1]),subject:String(r[2]),questions}))};});
}
function listResults_(examId) {
  const exams=rows_(SHEETS.EXAMS),attempts=rows_(SHEETS.ATTEMPTS),map={}; exams.forEach(r=>map[String(r[0])]=r);
  return attempts.filter(a=>!examId||String(a[1])===String(examId)).map(a=>({attemptId:String(a[0]),examId:String(a[1]),studentId:String(a[2]||''),name:String(a[3]),answers:safeJson_(a[4],[]),score:Number(a[5])||0,total:Number(a[6])||0,at:a[7],durationSeconds:Number(a[8])||0,examTitle:map[String(a[1])]?String(map[String(a[1])][1]):'',subject:map[String(a[1])]?String(map[String(a[1])][2]):''}));
}
function getStudentResults_(body) {
  const s=requireStudent_(body);
  return {ok:true,results:listResults_('').filter(r=>String(r.studentId)===String(s.studentId))};
}

function listBooks_() { return rows_(SHEETS.BOOKS).filter(r=>r[0] && String(r[5]).toLowerCase()!=='false').map(r=>({id:String(r[0]),subject:String(r[1]),title:String(r[2]),url:String(r[3]),createdAt:r[4]})); }
function createBook_(book) { if(!book||!book.title||!book.subject||!book.url)throw new Error('بيانات الكتاب ناقصة'); const u=String(book.url).trim(); if(!/^https?:\/\//i.test(u))throw new Error('رابط الكتاب غير صحيح'); const id='book-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);getSheet_(SHEETS.BOOKS).appendRow([id,String(book.subject).trim(),String(book.title).trim(),u,new Date().toISOString(),true]);return {ok:true}; }
function deleteBook_(id){if(!id)throw new Error('معرف الكتاب ناقص');deleteRowsByValue_(SHEETS.BOOKS,1,String(id));return {ok:true};}

function listVideos_() { return rows_(SHEETS.VIDEOS).filter(r=>r[0]&&String(r[5]).toLowerCase()!=='false').map(r=>({id:String(r[0]),subject:String(r[1]),title:String(r[2]),url:String(r[3]),createdAt:r[4]})); }
function createVideo_(video) { if(!video||!video.title||!video.subject||!video.url)throw new Error('بيانات الفيديو ناقصة'); const u=String(video.url).trim(); if(!/^https?:\/\//i.test(u))throw new Error('رابط الفيديو غير صحيح'); const id='vid-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);getSheet_(SHEETS.VIDEOS).appendRow([id,String(video.subject).trim(),String(video.title).trim(),u,new Date().toISOString(),true]);return {ok:true}; }
function deleteVideo_(id){if(!id)throw new Error('معرف الفيديو ناقص');deleteRowsByValue_(SHEETS.VIDEOS,1,String(id));return {ok:true};}

function listStudents_(){return rows_(SHEETS.STUDENTS).filter(r=>r[0]&&String(r[5]).toLowerCase()!=='false').map(r=>({id:String(r[0]),name:String(r[1]||''),code:String(r[2]),createdAt:r[3],updatedAt:r[4],active:true,phone:String(r[6]||'')}));}
function createStudent_(student){
  const identifier=normalizeName_(student&&student.identifier);
  const code=normalizeCode_(student&&student.code);
  if(!identifier) throw new Error('اكتب اسم الطالب أو رقم الهاتف.');
  const phone=normalizePhone_(identifier);
  const isPhone=/^01\d{9}$/.test(phone);
  const name=isPhone ? '' : identifier;
  if(!isPhone) validateTripleName_(name);
  if(isPhone && !/^01\d{9}$/.test(phone)) throw new Error('رقم الهاتف يجب أن يكون 11 رقمًا ويبدأ بـ 01.');
  validateCode_(code);
  const lock=LockService.getScriptLock(); lock.waitLock(15000);
  try{
    const all=rows_(SHEETS.STUDENTS).filter(r=>String(r[5]).toLowerCase()!=='false');
    if(all.some(r=>normalizeCode_(r[2])===code)) throw new Error('هذا الكود مستخدم بالفعل، اختر كودًا آخر.');
    if(isPhone && all.some(r=>normalizePhone_(r[6]||'')===phone)) throw new Error('رقم الهاتف مستخدم بالفعل.');
    if(!isPhone && all.some(r=>normalizeName_(r[1])===name)) throw new Error('اسم الطالب مستخدم بالفعل.');
    const id='stu-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7), now=new Date().toISOString();
    getSheet_(SHEETS.STUDENTS).appendRow([id,name,code,now,now,true,isPhone?phone:'']);
    return {ok:true,student:{id,name,code,phone:isPhone?phone:''}};
  }finally{lock.releaseLock();}
}
function updateStudentCode_(id,code){id=String(id||'');code=normalizeCode_(code);if(!id)throw new Error('معرف الطالب ناقص');validateCode_(code);const rows=rows_(SHEETS.STUDENTS);if(rows.some(r=>String(r[0])!==id&&normalizeCode_(r[2])===code&&String(r[5]).toLowerCase()!=='false'))throw new Error('هذا الكود مستخدم بالفعل.');const sh=getSheet_(SHEETS.STUDENTS),data=sh.getDataRange().getValues();for(let i=1;i<data.length;i++)if(String(data[i][0])===id){sh.getRange(i+1,3).setValue(code);sh.getRange(i+1,5).setValue(new Date().toISOString());return {ok:true};}throw new Error('الطالب غير موجود');}
function deleteStudent_(id){if(!id)throw new Error('معرف الطالب ناقص');deleteRowsByValue_(SHEETS.STUDENTS,1,String(id));return {ok:true};}

function createExam_(exam){validateExam_(exam);const lock=LockService.getScriptLock();lock.waitLock(15000);try{const now=new Date().toISOString();getSheet_(SHEETS.EXAMS).appendRow([String(exam.id),String(exam.title),String(exam.subject),Number(exam.duration)||0,Number(exam.attemptLimit)||0,!!exam.showScore,now,now,true]);writeQuestions_(String(exam.id),exam.questions||[]);return {ok:true};}finally{lock.releaseLock();}}
function updateExam_(exam){validateExam_(exam);const id=String(exam.id),sh=getSheet_(SHEETS.EXAMS),data=sh.getDataRange().getValues();let row=-1;for(let i=1;i<data.length;i++)if(String(data[i][0])===id){row=i+1;break;}if(row<0)throw new Error('الامتحان غير موجود');sh.getRange(row,1,1,9).setValues([[id,String(exam.title),String(exam.subject),Number(exam.duration)||0,Number(exam.attemptLimit)||0,!!exam.showScore,data[row-1][6],new Date().toISOString(),true]]);deleteQuestionRows_(id);writeQuestions_(id,exam.questions||[]);return {ok:true};}
function deleteExam_(id){id=String(id);const lock=LockService.getScriptLock();lock.waitLock(15000);try{deleteRowsByValue_(SHEETS.EXAMS,1,id);deleteRowsByValue_(SHEETS.QUESTIONS,1,id);deleteRowsByValue_(SHEETS.ATTEMPTS,2,id);return {ok:true};}finally{lock.releaseLock();}}
function clearExams_(){const lock=LockService.getScriptLock();lock.waitLock(15000);try{clearData_(SHEETS.EXAMS);clearData_(SHEETS.QUESTIONS);clearData_(SHEETS.ATTEMPTS);return {ok:true,message:'تم مسح الامتحانات والأسئلة والنتائج المرتبطة بها.'};}finally{lock.releaseLock();}}
function clearResults_(){clearData_(SHEETS.ATTEMPTS);return {ok:true};}
function clearSheetData_(name){clearData_(name);return {ok:true};}
function clearData_(name){const sh=getSheet_(name);const last=sh.getLastRow();if(last>1)sh.getRange(2,1,last-1,sh.getLastColumn()).clearContent();}

function submitAttempt_(body){const student=requireStudent_(body);const id=String(body.examId||''),answers=Array.isArray(body.answers)?body.answers:[];const exam=listPublicExams_().find(x=>x.id===id);if(!exam)throw new Error('الامتحان غير موجود أو غير منشور');if(answers.length!==exam.questions.length)throw new Error('عدد الإجابات غير صحيح');const lock=LockService.getScriptLock();lock.waitLock(15000);try{const attempts=rows_(SHEETS.ATTEMPTS);const existing=attempts.find(a=>String(a[1])===id&&String(a[2])===String(student.studentId));if(existing)throw new Error('هذا الطالب دخل الامتحان بالفعل، ولا يمكن تكرار المحاولة.');let score=0;answers.forEach((v,i)=>{if(Number(v)===Number(getCorrect_(id,i)))score++;});const attemptId='att-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);getSheet_(SHEETS.ATTEMPTS).appendRow([attemptId,id,student.studentId,student.name,JSON.stringify(answers),score,exam.questions.length,new Date().toISOString(),Number(body.durationSeconds)||0]);return {ok:true,score,total:exam.questions.length,showScore:!!exam.showScore,attemptId};}finally{lock.releaseLock();}}
function getCorrect_(examId,index){const q=rows_(SHEETS.QUESTIONS).find(r=>String(r[0])===String(examId)&&Number(r[1])===Number(index));return q?Number(q[7]):-99;}
function writeQuestions_(examId,questions){if(!questions.length)return;const out=questions.map((q,i)=>[examId,i,String(q.text||''),String(q.options?.[0]||''),String(q.options?.[1]||''),String(q.options?.[2]||''),String(q.options?.[3]||''),Math.max(0,Math.min(3,Number(q.correct)||0))]);getSheet_(SHEETS.QUESTIONS).getRange(getSheet_(SHEETS.QUESTIONS).getLastRow()+1,1,out.length,8).setValues(out);}
function deleteQuestionRows_(examId){deleteRowsByValue_(SHEETS.QUESTIONS,1,String(examId));}
function deleteRowsByValue_(sheetName,col,value){const sh=getSheet_(sheetName),data=sh.getDataRange().getValues();for(let i=data.length-1;i>=1;i--)if(String(data[i][col-1])===String(value))sh.deleteRow(i+1);}
function validateExam_(e){if(!e||!e.id||!e.title||!e.subject)throw new Error('بيانات الامتحان ناقصة');if(!Array.isArray(e.questions)||!e.questions.length)throw new Error('يجب إضافة سؤال واحد على الأقل');e.questions.forEach((q,i)=>{if(!q.text||!Array.isArray(q.options)||q.options.length!==4)throw new Error('السؤال '+(i+1)+' غير مكتمل');});}
function safeJson_(v,fallback){try{return JSON.parse(String(v||''))}catch(e){return fallback}}
