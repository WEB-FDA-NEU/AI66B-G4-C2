// Page-specific behaviour for login.html
(function () {
  var form = document.getElementById('loginForm');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
  });
})();