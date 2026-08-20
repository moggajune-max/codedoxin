(() => {
  const { createClient } = window.supabase;
  const client = createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY
  );

  window.fcb = client;

  const $ = (s) => document.querySelector(s);

  const esc = (v = '') =>
    String(v).replace(/[&<>'"]/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c]));

  const money = (n) =>
    `UGX ${Number(n || 0).toLocaleString()}`;

  const show = (el, text, ok = false) => {
    if (!el) return;

    el.hidden = false;
    el.textContent = text;
    el.className = `notice ${ok ? 'success' : 'error'}`;
  };

  // =========================
  // AUTH / PROFILE HELPERS
  // =========================

  async function session() {
    return (await client.auth.getSession()).data.session;
  }

  async function profile(uid) {
    const result = await client
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (result.error) {
      console.error('Profile error:', result.error);
      return null;
    }

    return result.data;
  }

  async function guardStudent() {
    const s = await session();

    if (!s) {
      location.href = 'auth.html';
      return null;
    }

    const p = await profile(s.user.id);

    if (p?.role === 'admin') {
      location.href = 'admin.html';
      return null;
    }

    return {
      session: s,
      profile: p
    };
  }

  async function guardAdmin() {
    const s = await session();

    if (!s) {
      location.href = 'auth.html';
      return null;
    }

    const p = await profile(s.user.id);

    if (p?.role !== 'admin') {
      location.href = 'dashboard.html';
      return null;
    }

    return {
      session: s,
      profile: p
    };
  }

  // =========================
  // SIGN OUT
  // =========================

  document
    .querySelectorAll('[data-signout]')
    .forEach(btn => {
      btn.addEventListener('click', async () => {
        await client.auth.signOut();
        location.href = 'index.html';
      });
    });

  // =========================
  // LOGIN
  // =========================

  const loginForm = $('#loginForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();

      const msg = $('#authMsg');

      if (msg) {
        msg.hidden = false;
        msg.textContent = 'Signing in…';
      }

      const {
        data,
        error
      } = await client.auth.signInWithPassword({
        email: $('#loginEmail').value.trim(),
        password: $('#loginPassword').value
      });

      if (error) {
        show(msg, error.message);
        return;
      }

      const p = await profile(data.user.id);

      location.href =
        p?.role === 'admin'
          ? 'admin.html'
          : 'dashboard.html';
    });
  }

  // =========================
  // SIGN UP
  // =========================

  const signupForm = $('#signupForm');

  if (signupForm) {
    signupForm.addEventListener('submit', async e => {
      e.preventDefault();

      const msg = $('#authMsg');

      if (msg) {
        msg.hidden = false;
        msg.textContent = 'Creating account…';
      }

      const full_name = $('#fullName').value.trim();
      const phone = $('#phone').value.trim();
      const email = $('#email').value.trim();
      const password = $('#password').value;

      const {
        data,
        error
      } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name,
            phone
          }
        }
      });

      if (error) {
        show(msg, error.message);
        return;
      }

      /*
       * If email confirmation is OFF,
       * create/update the profile immediately.
       *
       * If email confirmation is ON,
       * the SQL trigger in Supabase should create
       * the profile after signup.
       */

      if (data.session && data.user) {
        const r = await client
          .from('profiles')
          .upsert({
            id: data.user.id,
            full_name,
            phone,
            role: 'student'
          });

        if (r.error) {
          show(msg, r.error.message);
          return;
        }

        show(
          msg,
          'Account created successfully. You can now log in.',
          true
        );
      } else {
        show(
          msg,
          'Account created. Check your email if confirmation is required, then log in.',
          true
        );
      }
    });
  }

  // =========================
  // STUDENT DASHBOARD
  // =========================

  const regForm = $('#registrationForm');

  if (regForm) {
    (async () => {
      const ctx = await guardStudent();

      if (!ctx) return;

      $('#userName').textContent =
        ctx.profile?.full_name || 'Student';

      $('#userEmail').textContent =
        ctx.session.user.email || '';

      $('#regName').value =
        ctx.profile?.full_name || '';

      $('#regPhone').value =
        ctx.profile?.phone || '';

      $('#regEmail').value =
        ctx.session.user.email || '';

      const coursesResult = await client
        .from('courses')
        .select('*')
        .eq('active', true)
        .order('title');

      if (coursesResult.error) {
        show(
          $('#regMsg'),
          coursesResult.error.message
        );
        return;
      }

      const courses = coursesResult.data || [];

      $('#regCourse').innerHTML = courses
        .map(c =>
          `<option value="${c.id}">
            ${esc(c.title)} — ${money(c.price)}
          </option>`
        )
        .join('');

      await refreshDashboard(ctx.session.user.id);
    })();
  }

  // =========================
  // REFRESH STUDENT DASHBOARD
  // =========================

  async function refreshDashboard(uid) {

    // -------------------------
    // PAYMENTS / REGISTRATIONS
    // -------------------------

    const regsResult = await client
      .from('payments')
      .select(`
        id,
        transaction_id,
        amount,
        status,
        created_at,
        courses(title)
      `)
      .eq('student_id', uid)
      .order('created_at', {
        ascending: false
      });

    if (regsResult.error) {
      show(
        $('#regMsg'),
        regsResult.error.message
      );
      return;
    }

    const regs = regsResult.data || [];

    $('#registrationList').innerHTML =
      regs.length
        ? regs.map(r => `
          <div class="item">
            <strong>
              ${esc(r.courses?.title || 'Course')}
            </strong>
            <br>
            <span class="small">
              MTN ID:
              ${esc(r.transaction_id || '')}
              •
              ${money(r.amount)}
              •
              <b>${esc(r.status || '')}</b>
            </span>
          </div>
        `).join('')
        : '<p class="small">No registrations yet.</p>';

    // -------------------------
    // ENROLLMENTS
    // -------------------------

    const ensResult = await client
      .from('enrollments')
      .select(`
        id,
        status,
        course_id,
        courses(title)
      `)
      .eq('student_id', uid)
      .order('enrolled_at', {
        ascending: false
      });

    if (ensResult.error) {
      show(
        $('#regMsg'),
        ensResult.error.message
      );
      return;
    }

    const ens = ensResult.data || [];

    $('#enrollmentList').innerHTML =
      ens.length
        ? ens.map(e => `
          <div class="item">
            <strong>
              ${esc(e.courses?.title || 'Course')}
            </strong>

            <span class="small">
              — ${esc(e.status || '')}
            </span>

            ${
              e.status === 'active'
                ? `
                  <a
                    class="btn btn-primary mini"
                    href="lessons.html?course=${e.course_id}"
                  >
                    Open lessons
                  </a>
                `
                : ''
            }
          </div>
        `).join('')
        : '<p class="small">Verified courses will appear here.</p>';
  }

  // =========================
  // STUDENT REGISTRATION
  // =========================

  if (regForm) {
    regForm.addEventListener('submit', async e => {

      e.preventDefault();

      const ctx = await guardStudent();

      if (!ctx) return;

      const msg = $('#regMsg');

      if (msg) {
        msg.hidden = false;
        msg.textContent = 'Submitting…';
      }

      // -------------------------
      // UPDATE PROFILE
      // -------------------------

      const r = await client
        .from('profiles')
        .update({
          full_name: $('#regName').value.trim(),
          phone: $('#regPhone').value.trim()
        })
        .eq('id', ctx.session.user.id);

      if (r.error) {
        show(msg, r.error.message);
        return;
      }

      // -------------------------
      // GET COURSE
      // -------------------------

      const courseId = $('#regCourse').value;

      const courseResult = await client
        .from('courses')
        .select('price')
        .eq('id', courseId)
        .single();

      if (courseResult.error) {
        show(
          msg,
          courseResult.error.message
        );
        return;
      }

      const course = courseResult.data;

      // -------------------------
      // PAYMENT
      // -------------------------

      const transactionId =
        $('#regTx').value.trim();

      if (!transactionId) {
        show(
          msg,
          'Please enter your MTN transaction ID.'
        );
        return;
      }

      const p = await client
        .from('payments')
        .insert({
          student_id: ctx.session.user.id,
          course_id: courseId,
          mtn_number: '0764681561',
          transaction_id: transactionId,
          amount: course?.price || 0
        });

      if (p.error) {
        show(msg, p.error.message);
        return;
      }

      // -------------------------
      // SUCCESS
      // -------------------------

      show(
        msg,
        'Registration submitted. Your payment is pending admin verification.',
        true
      );

      regForm.reset();

      $('#regName').value =
        ctx.profile?.full_name || '';

      $('#regPhone').value =
        ctx.profile?.phone || '';

      $('#regEmail').value =
        ctx.session.user.email || '';

      await refreshDashboard(
        ctx.session.user.id
      );
    });
  }

  // =========================
  // ADMIN DASHBOARD
  // =========================

  const adminRows = $('#adminRows');

  if (adminRows) {
    (async () => {

      const ctx = await guardAdmin();

      if (!ctx) return;

      await loadAdmin();

    })();
  }

  // =========================
  // LOAD ADMIN DATA
  // =========================

  async function loadAdmin() {

    /*
     * IMPORTANT:
     *
     * payments has more than one relationship
     * with profiles because student_id and
     * verified_by can both point to profiles.
     *
     * We explicitly use:
     *
     * payments_student_id_fkey
     *
     * so Supabase knows we want the student's
     * profile.
     */

    const r = await client
      .from('payments')
      .select(`
        id,
        student_id,
        transaction_id,
        amount,
        status,
        created_at,
        student:profiles!payments_student_id_fkey(
          full_name,
          phone
        ),
        courses(title)
      `)
      .order('created_at', {
        ascending: false
      });

    if (r.error) {
      console.error('Admin payments error:', r.error);

      show(
        $('#adminMsg'),
        r.error.message
      );

      return;
    }

    const rows = r.data || [];

    adminRows.innerHTML =
      rows.length
        ? rows.map(x => `
          <tr>

            <td>
              ${esc(x.student?.full_name || '')}
            </td>

            <td>
              ${esc(x.student?.phone || '')}
            </td>

            <td>
              ${esc(x.courses?.title || '')}
            </td>

            <td>
              ${esc(x.transaction_id || '')}
            </td>

            <td>
              <span class="badge">
                ${esc(x.status || '')}
              </span>
            </td>

            <td>
              ${x.created_at
                ? new Date(
                    x.created_at
                  ).toLocaleDateString()
                : ''
              }
            </td>

            <td>
              ${
                x.status === 'pending'
                  ? `
                    <button
                      class="btn mini"
                      data-verify="${x.id}"
                    >
                      Verify
                    </button>

                    <button
                      class="btn btn-outline mini"
                      data-reject="${x.id}"
                    >
                      Reject
                    </button>
                  `
                  : ''
              }
            </td>

          </tr>
        `).join('')
        : '<tr><td colspan="7">No registrations yet.</td></tr>';

    // -------------------------
    // VERIFY BUTTONS
    // -------------------------

    adminRows
      .querySelectorAll('[data-verify]')
      .forEach(b => {
        b.onclick = () =>
          verifyPayment(
            b.dataset.verify
          );
      });

    // -------------------------
    // REJECT BUTTONS
    // -------------------------

    adminRows
      .querySelectorAll('[data-reject]')
      .forEach(b => {
        b.onclick = () =>
          rejectPayment(
            b.dataset.reject
          );
      });

    // -------------------------
    // COURSES
    // -------------------------

    const coursesResult = await client
      .from('courses')
      .select('id,title')
      .eq('active', true)
      .order('title');

    if (coursesResult.error) {
      show(
        $('#adminMsg'),
        coursesResult.error.message
      );
      return;
    }

    const courses =
      coursesResult.data || [];

    if ($('#lessonCourse')) {
      $('#lessonCourse').innerHTML =
        courses
          .map(c =>
            `<option value="${c.id}">
              ${esc(c.title)}
            </option>`
          )
          .join('');
    }

    await loadLessonsForAdmin();
  }

  // =========================
  // VERIFY PAYMENT
  // =========================

  async function verifyPayment(id) {

    const s = await session();

    if (!s) {
      location.href = 'auth.html';
      return;
    }

    const payResult = await client
      .from('payments')
      .select('student_id,course_id')
      .eq('id', id)
      .single();

    if (payResult.error) {
      show(
        $('#adminMsg'),
        payResult.error.message
      );
      return;
    }

    const pay = payResult.data;

    // -------------------------
    // VERIFY PAYMENT
    // -------------------------

    const u = await client
      .from('payments')
      .update({
        status: 'verified',
        verified_by: s.user.id,
        verified_at: new Date().toISOString()
      })
      .eq('id', id);

    if (u.error) {
      show(
        $('#adminMsg'),
        u.error.message
      );
      return;
    }

    // -------------------------
    // CREATE ENROLLMENT
    // -------------------------

    const e = await client
      .from('enrollments')
      .upsert(
        {
          student_id: pay.student_id,
          course_id: pay.course_id,
          status: 'active'
        },
        {
          onConflict: 'student_id,course_id'
        }
      );

    if (e.error) {
      show(
        $('#adminMsg'),
        e.error.message
      );
      return;
    }

    show(
      $('#adminMsg'),
      'Payment verified and student enrolled.',
      true
    );

    await loadAdmin();
  }

  // =========================
  // REJECT PAYMENT
  // =========================

  async function rejectPayment(id) {

    const r = await client
      .from('payments')
      .update({
        status: 'rejected'
      })
      .eq('id', id);

    if (r.error) {
      show(
        $('#adminMsg'),
        r.error.message
      );
      return;
    }

    show(
      $('#adminMsg'),
      'Payment rejected.',
      true
    );

    await loadAdmin();
  }

  // =========================
  // LESSON FORM
  // =========================

  const lessonForm = $('#lessonForm');

  if (lessonForm) {

    lessonForm.addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const ctx = await guardAdmin();

        if (!ctx) return;

        const r = await client
          .from('lessons')
          .insert({
            course_id:
              $('#lessonCourse').value,

            title:
              $('#lessonTitle').value.trim(),

            lesson_order:
              Number(
                $('#lessonOrder').value
              ),

            content:
              $('#lessonContent').value
          });

        if (r.error) {
          show(
            $('#lessonMsg'),
            r.error.message
          );
          return;
        }

        show(
          $('#lessonMsg'),
          'Lesson published.',
          true
        );

        lessonForm.reset();

        $('#lessonOrder').value = 1;

        await loadLessonsForAdmin();
      }
    );
  }

  // =========================
  // ADMIN LESSON LIST
  // =========================

  async function loadLessonsForAdmin() {

    if (!$('#lessonList')) return;

    const r = await client
      .from('lessons')
      .select(`
        id,
        title,
        lesson_order,
        courses(title)
      `)
      .order('lesson_order');

    if (r.error) {
      show(
        $('#adminMsg'),
        r.error.message
      );
      return;
    }

    const lessons = r.data || [];

    $('#lessonList').innerHTML =
      lessons.length
        ? lessons.map(l => `
          <div class="item">

            <strong>
              ${esc(l.title)}
            </strong>

            <br>

            <span class="small">
              ${esc(l.courses?.title || '')}
              • Lesson ${l.lesson_order}
            </span>

          </div>
        `).join('')
        : '<p class="small">No lessons yet.</p>';
  }

  // =========================
  // STUDENT LESSONS
  // =========================

  const lessonCards = $('#lessonCards');

  if (lessonCards) {

    (async () => {

      const ctx = await guardStudent();

      if (!ctx) return;

      const courseId =
        new URLSearchParams(
          location.search
        ).get('course');

      if (!courseId) {
        show(
          $('#lessonPageMsg'),
          'No course selected.'
        );
        return;
      }

      // -------------------------
      // CHECK ENROLLMENT
      // -------------------------

      const enrolledResult = await client
        .from('enrollments')
        .select(`
          status,
          courses(title)
        `)
        .eq('student_id', ctx.session.user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (enrolledResult.error) {
        show(
          $('#lessonPageMsg'),
          enrolledResult.error.message
        );
        return;
      }

      const enrolled =
        enrolledResult.data;

      if (
        !enrolled ||
        enrolled.status !== 'active'
      ) {
        show(
          $('#lessonPageMsg'),
          'This course is not active for your account.'
        );
        return;
      }

      $('#courseTitle').textContent =
        enrolled.courses?.title ||
        'Course lessons';

      // -------------------------
      // LOAD LESSONS
      // -------------------------

      const r = await client
        .from('lessons')
        .select(`
          id,
          title,
          content,
          lesson_order
        `)
        .eq('course_id', courseId)
        .order('lesson_order');

      if (r.error) {
        show(
          $('#lessonPageMsg'),
          r.error.message
        );
        return;
      }

      const lessons = r.data || [];

      lessonCards.innerHTML =
        lessons.length
          ? lessons.map(l => `
            <article class="card lesson">

              <span class="eyebrow">
                Lesson ${l.lesson_order}
              </span>

              <h2>
                ${esc(l.title)}
              </h2>

              <div>
                ${esc(l.content)
                  .replace(/\n/g, '<br>')}
              </div>

              <button
                class="btn btn-primary mini"
                data-complete="${l.id}"
              >
                Mark complete
              </button>

            </article>
          `).join('')
          : '<p>No lessons have been published yet.</p>';

      // -------------------------
      // MARK LESSON COMPLETE
      // -------------------------

      lessonCards
        .querySelectorAll('[data-complete]')
        .forEach(b => {

          b.onclick = async () => {

            const x = await client
              .from('progress')
              .upsert(
                {
                  student_id:
                    ctx.session.user.id,

                  lesson_id:
                    b.dataset.complete,

                  completed: true,

                  completed_at:
                    new Date().toISOString()
                },
                {
                  onConflict:
                    'student_id,lesson_id'
                }
              );

            if (x.error) {

              show(
                $('#lessonPageMsg'),
                x.error.message
              );

              return;
            }

            b.textContent =
              'Completed ✓';

            b.disabled = true;
          };

        });

    })();
  }

})();
