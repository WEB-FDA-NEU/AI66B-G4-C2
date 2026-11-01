// Page-specific behaviour for register.html
(function () {
  var form = document.getElementById('registerForm');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
  });
})();