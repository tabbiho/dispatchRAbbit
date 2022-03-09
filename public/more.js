const button = document.getElementById('moreBtn');
const modelDiv = document.getElementById('modelDiv');
const template = document.getElementById('modelTemplate');

button.addEventListener('click', () => {
  const templateClone = template.cloneNode(true);
  modelDiv.appendChild(templateClone);
});

const removeButton = document.getElementById('removeBtn');
removeButton.addEventListener('click', () => {
  modelDiv.removeChild(modelDiv.lastChild);
});
