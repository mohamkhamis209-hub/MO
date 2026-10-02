/**
 * Thaneya Baccalaurea - Google Apps Script backend
 * Google Sheet = database
 */
const ADMIN_TOKEN_PROPERTY = 'ADMIN_TOKEN';
const SESSION_TTL_MS = 30 * 60 * 1000;
const SHEETS = {
  EXAMS: 'Exams',
  QUESTIONS: 'Questions',
  ATTEMPTS: 'Attempts',
  BOOKS: 'Books'
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.EXAMS, ['id','title','subject','duration','attemptLimit','showScore','createdAt','updatedAt','active']);
  ensureSheet_(ss, SHEETS.QUESTIONS, ['examId','qIndex','text','opt1','opt2','opt3','opt4','correct']);
  ensureSheet_(ss, SHEETS.ATTEMPTS, ['attemptId','examId','name','answersJson','score','total','at','durationSeconds']);
  ensureSheet_(ss, SHEETS.BOOKS, ['id','subject','title','url','createdAt','active']);
  if (!PropertiesService.getScriptProperties().getProperty(ADMIN_TOKEN_PROPERTY)) {
    PropertiesService.getScriptProperties().setProperty(ADMIN_TOKEN_PROPERTY, 'CHANGE_THIS_ADMIN_TOKEN');
  }
  return {ok:true};
}

function doGet() {
  return json_({ok:true,service:'Thaneya Baccalaurea Exam API',message:'API is running'});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    switch (action) {
      case 'adminLogin': return json_(adminLogin_(body.password));
      case 'listExams': return json_({ok:true,exams:listPublicExams_()});
      case 'submitAttempt': return json_(submitAttempt_(body));
      case 'getStudentResults': return json_({ok:true,results:listStudentResults_(body.name || '')});
      case 'listBooks': return json_({ok:true,books:listBooks_()});
      case 'getAdminData': requireAdmin_(body); return json_({ok:true,exams:listAdminExams_(),books:listBooks_(),results:listResults_('')});
      case 'getResults': requireAdmin_(body); return json_({ok:true,results:listResults_(body.examId || '')});
      case 'createExam': requireAdmin_(body); return json_(createExam_(body.exam));
      case 'updateExam': requireAdmin_(body); return json_(updateExam_(body.exam));
      case 'deleteExam': requireAdmin_(body); return json_(deleteExam_(body.examId));
      case 'createBook': requireAdmin_(body); return json_(createBook_(body.book));
      case 'deleteBook': requireAdmin_(body); return json_(deleteBook_(body.bookId));
      default: return json_({ok:false,error:'أمر غير معروف'});
    }
  } catch (err) {
    return json_({ok:false,error:String(err.message || err)});
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function adminLogin_(password) {
  const expected = PropertiesService.getScriptProperties().getProperty(ADMIN_TOKEN_PROPERTY);
  if (!expected || String(password || '') !== String(expected)) throw new Error('كلمة المرور غير صحيحة');
  const token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  const expires = Date.now() + SESSION_TTL_MS;
  CacheService.getScriptCache().put('admin_session_' + token, String(expires), 1800);
  return {ok:true,session:token,expiresAt:expires};
}

function requireAdmin_(body) {
  const token = String(body.adminSession || '');
  if (!token) throw new Error('جلسة الإدارة منتهية، سجل الدخول مرة أخرى');
  const raw = CacheService.getScriptCache().get('admin_session_' + token);
  if (!raw || Number(raw) < Date.now()) throw new Error('جلسة الإدارة منتهية، سجل الدخول مرة أخرى');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  else {
    const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
    const same = headers.every((h,i)=>String(current[i] || '') === h);
    if (!same) sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  sh.setFrozenRows(1);
}
function getSheet_(name) { const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if(!sh) throw new Error('جدول '+name+' غير موجود. شغّل setup أولاً'); return sh; }
function rows_(name) { const sh=getSheet_(name), values=sh.getDataRange().getValues(); return values.length>1 ? values.slice(1) : []; }

function listPublicExams_() {
  const exams=rows_(SHEETS.EXAMS), qs=rows_(SHEETS.QUESTIONS);
  return exams.filter(r=>r[0] && String(r[8]).toLowerCase()!=='false').map(r=>({
    id:String(r[0]),title:String(r[1]),subject:String(r[2]),duration:Number(r[3])||0,
    attemptLimit:Number(r[4])||0,showScore:String(r[5]).toLowerCase()==='true',
    questions:qs.filter(q=>String(q[0])===String(r[0])).sort((a,b)=>Number(a[1])-Number(b[1])).map(q=>({text:String(q[2]),options:[String(q[3]),String(q[4]),String(q[5]),String(q[6])] }))
  })).filter(x=>x.questions.length);
}
function listAdminExams_() {
  const exams=rows_(SHEETS.EXAMS),qs=rows_(SHEETS.QUESTIONS),attempts=rows_(SHEETS.ATTEMPTS);
  return exams.filter(r=>r[0]).map(r=>{
    const id=String(r[0]);
    const questions=qs.filter(q=>String(q[0])===id).sort((a,b)=>Number(a[1])-Number(b[1])).map(q=>({text:String(q[2]),options:[String(q[3]),String(q[4]),String(q[5]),String(q[6])],correct:Number(q[7])||0}));
    return {id,title:String(r[1]),subject:String(r[2]),duration:Number(r[3])||0,attemptLimit:Number(r[4])||0,showScore:String(r[5]).toLowerCase()==='true',createdAt:r[6],updatedAt:r[7],active:String(r[8]).toLowerCase()!=='false',questions,attempts:attempts.filter(a=>String(a[1])===id).map(a=>({attemptId:String(a[0]),examId:id,name:String(a[2]),answers:safeJson_(a[3],[]),score:Number(a[4])||0,total:Number(a[5])||0,at:a[6],durationSeconds:Number(a[7])||0,examTitle:String(r[1]),subject:String(r[2]),questions}))};
  });
}
function listResults_(examId) {
  const exams=rows_(SHEETS.EXAMS),attempts=rows_(SHEETS.ATTEMPTS),map={}; exams.forEach(r=>map[String(r[0])]=r);
  return attempts.filter(a=>!examId||String(a[1])===String(examId)).map(a=>({attemptId:String(a[0]),examId:String(a[1]),name:String(a[2]),answers:safeJson_(a[3],[]),score:Number(a[4])||0,total:Number(a[5])||0,at:a[6],durationSeconds:Number(a[7])||0,examTitle:map[String(a[1])]?String(map[String(a[1])][1]):'',subject:map[String(a[1])]?String(map[String(a[1])][2]):''}));
}
function listStudentResults_(name) {
  const n=String(name||'').trim().toLocaleLowerCase(); if(!n) return [];
  return listResults_('').filter(r=>r.name.trim().toLocaleLowerCase()===n);
}

function listBooks_() {
  return rows_(SHEETS.BOOKS).filter(r=>r[0] && String(r[5]).toLowerCase()!=='false').map(r=>({id:String(r[0]),subject:String(r[1]),title:String(r[2]),url:String(r[3]),createdAt:r[4]}));
}
function createBook_(book) {
  if(!book || !book.title || !book.subject || !book.url) throw new Error('بيانات الكتاب ناقصة');
  const u=String(book.url); if(!/^https?:\/\//i.test(u)) throw new Error('رابط الكتاب غير صحيح');
  const id=String(book.id || ('book-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)));
  getSheet_(SHEETS.BOOKS).appendRow([id,String(book.subject).trim(),String(book.title).trim(),u,new Date().toISOString(),true]);
  return {ok:true,book:{id,subject:String(book.subject).trim(),title:String(book.title).trim(),url:u}};
}
function deleteBook_(id) { if(!id) throw new Error('معرف الكتاب ناقص'); deleteRowsByValue_(SHEETS.BOOKS,1,String(id)); return {ok:true}; }

function createExam_(exam) { validateExam_(exam); const lock=LockService.getScriptLock(); lock.waitLock(15000); try {const now=new Date().toISOString();getSheet_(SHEETS.EXAMS).appendRow([String(exam.id),String(exam.title),String(exam.subject),Number(exam.duration)||0,Number(exam.attemptLimit)||0,!!exam.showScore,now,now,true]);writeQuestions_(String(exam.id),exam.questions||[]);return {ok:true};} finally {lock.releaseLock();} }
function updateExam_(exam) { validateExam_(exam); const id=String(exam.id),sh=getSheet_(SHEETS.EXAMS),data=sh.getDataRange().getValues();let row=-1;for(let i=1;i<data.length;i++)if(String(data[i][0])===id){row=i+1;break;}if(row<0)throw new Error('الامتحان غير موجود');sh.getRange(row,1,1,9).setValues([[id,String(exam.title),String(exam.subject),Number(exam.duration)||0,Number(exam.attemptLimit)||0,!!exam.showScore,data[row-1][6],new Date().toISOString(),true]]);deleteQuestionRows_(id);writeQuestions_(id,exam.questions||[]);return {ok:true}; }
function deleteExam_(id) { id=String(id);const lock=LockService.getScriptLock();lock.waitLock(15000);try{deleteRowsByValue_(SHEETS.EXAMS,1,id);deleteRowsByValue_(SHEETS.QUESTIONS,1,id);deleteRowsByValue_(SHEETS.ATTEMPTS,2,id);return {ok:true};}finally{lock.releaseLock();} }

function submitAttempt_(body) {
  const id=String(body.examId||''),name=String(body.name||'').trim().replace(/\s+/g,' '),answers=Array.isArray(body.answers)?body.answers:[];
  if(!id||!name)throw new Error('بيانات الطالب أو الامتحان ناقصة');
  const exam=listPublicExams_().find(x=>x.id===id);if(!exam)throw new Error('الامتحان غير موجود أو غير منشور');
  if(answers.length!==exam.questions.length)throw new Error('عدد الإجابات غير صحيح');
  const lock=LockService.getScriptLock();lock.waitLock(15000);try{const existing=rows_(SHEETS.ATTEMPTS).some(a=>String(a[1])===id&&String(a[2]).trim().toLocaleLowerCase()===name.toLocaleLowerCase());if(Number(exam.attemptLimit)===1&&existing)throw new Error('تم تسجيل محاولة بهذا الاسم بالفعل');let score=0;answers.forEach((v,i)=>{if(Number(v)===Number(getCorrect_(id,i)))score++;});const attemptId='att-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);getSheet_(SHEETS.ATTEMPTS).appendRow([attemptId,id,name,JSON.stringify(answers),score,exam.questions.length,new Date().toISOString(),Number(body.durationSeconds)||0]);return {ok:true,score,total:exam.questions.length,showScore:!!exam.showScore,attemptId};}finally{lock.releaseLock();}
}
function getCorrect_(examId,index){const q=rows_(SHEETS.QUESTIONS).find(r=>String(r[0])===String(examId)&&Number(r[1])===Number(index));return q?Number(q[7]):-99;}
function writeQuestions_(examId,questions){if(!questions.length)return;const out=questions.map((q,i)=>[examId,i,String(q.text||''),String(q.options?.[0]||''),String(q.options?.[1]||''),String(q.options?.[2]||''),String(q.options?.[3]||''),Math.max(0,Math.min(3,Number(q.correct)||0))]);getSheet_(SHEETS.QUESTIONS).getRange(getSheet_(SHEETS.QUESTIONS).getLastRow()+1,1,out.length,8).setValues(out);}
function deleteQuestionRows_(examId){deleteRowsByValue_(SHEETS.QUESTIONS,1,String(examId));}
function deleteRowsByValue_(sheetName,col,value){const sh=getSheet_(sheetName),data=sh.getDataRange().getValues();for(let i=data.length-1;i>=1;i--)if(String(data[i][col-1])===String(value))sh.deleteRow(i+1);}
function validateExam_(e){if(!e||!e.id||!e.title||!e.subject)throw new Error('بيانات الامتحان ناقصة');if(!Array.isArray(e.questions)||!e.questions.length)throw new Error('يجب إضافة سؤال واحد على الأقل');e.questions.forEach((q,i)=>{if(!q.text||!Array.isArray(q.options)||q.options.length!==4)throw new Error('السؤال '+(i+1)+' غير مكتمل');});}
function safeJson_(v,fallback){try{return JSON.parse(String(v||''))}catch(e){return fallback}}
