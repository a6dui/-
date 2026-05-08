// Form Handler Script (Frontend)

document.addEventListener('DOMContentLoaded', () => {
    // Find all forms that we want to send to our backend
    const tgForms = document.querySelectorAll('form[data-tg-form="true"]');

    tgForms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent default form submission

            // Provide visual feedback (e.g., change button text)
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerText;
            submitBtn.innerText = 'Відправлення...';
            submitBtn.disabled = true;

            // Gather form data into an object
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            try {
                // Send data to our Node.js backend
                const response = await fetch('/api/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    alert('Ваша заявка успішно відправлена! Наші фахівці зв\'яжуться з вами найближчим часом.');
                    form.reset(); // Clear the form
                } else {
                    const errorData = await response.json();
                    console.error('Server error:', errorData);
                    alert('Сталася помилка при відправленні. Будь ласка, спробуйте пізніше або зателефонуйте нам.');
                }
            } catch (error) {
                console.error('Network or fetch error:', error);
                alert('Сталася помилка мережі. Перевірте з\'єднання та спробуйте ще раз.');
            } finally {
                // Restore button state
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    });
});
