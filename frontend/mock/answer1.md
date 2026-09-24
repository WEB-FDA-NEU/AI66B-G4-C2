There are several ways to reverse a list in Python.

One simple approach is slicing:

```python
numbers = [1, 2, 3, 4, 5]

reversed_numbers = numbers[::-1]

print(reversed_numbers)
```

This creates a **new list**, leaving the original list unchanged.

You can think of the operation as:

$$
a_i' = a_{n-i-1}
$$